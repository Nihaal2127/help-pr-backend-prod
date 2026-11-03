/**
 * One-time backfill of partner_post media storage sizes so subscription quotas
 * include existing posts (images on S3 + videos on Bunny Stream).
 *
 * Sets:
 *   - image_byte_sizes[]
 *   - video.storage_bytes (video posts)
 *   - media_storage_bytes
 *
 * Usage (from help-pr-backend-staging/):
 *   node scripts/backfill-partner-post-storage-bytes.js --dry-run
 *   node scripts/backfill-partner-post-storage-bytes.js
 *   node scripts/backfill-partner-post-storage-bytes.js --include-deleted
 *
 * Requires: MONGO_URI (or MONGODB_URI / DB_URL), AWS_S3_BUCKET (+ AWS creds/region),
 * and Bunny Stream env vars for video posts.
 */
require('dotenv').config();
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const PartnerPost = require('../models/partner_post');
const {
  POST_MEDIA_TYPE_VIDEO,
  parseBunnyVideoId,
} = require('../enum/post_media_enum');
const {
  isBunnyStreamConfigured,
  getBunnyVideo,
} = require('../services/bunny_stream_service');
const { getBunnyVideoStorageBytes } = require('../services/partner_post_storage_service');

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const BATCH_SIZE = 50;
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const INCLUDE_DELETED = args.has('--include-deleted');

const normalizeS3Key = (value = '') =>
  String(value)
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/^\/+/, '')
    .trim();

const createS3Client = () => {
  if (process.env.NODE_ENV !== 'production') {
    return new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return new S3Client();
};

const resolveLocalImageBytes = (key) => {
  const localRoot = String(process.env.LOCAL_IMAGE_DIR || '').trim();
  if (!localRoot || !key) return null;
  const fullPath = path.isAbsolute(key) ? key : path.join(localRoot, key);
  try {
    if (!fs.existsSync(fullPath)) return null;
    const stat = fs.statSync(fullPath);
    return Number.isFinite(stat.size) && stat.size > 0 ? Math.floor(stat.size) : 0;
  } catch {
    return null;
  }
};

const headObjectBytes = async (s3, bucket, key) => {
  try {
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const n = Number(result.ContentLength);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode || error?.name;
    if (status !== 404 && status !== 'NotFound' && status !== 'NoSuchKey') {
      console.warn(`HeadObject failed for ${key}:`, error.message || error);
    }
    return 0;
  }
};

const resolveImageBytes = async (s3, bucket, rawUrl) => {
  const key = normalizeS3Key(rawUrl);
  if (!key) return 0;

  const localBytes = resolveLocalImageBytes(key);
  if (localBytes != null) return localBytes;

  if (!bucket) return 0;
  return headObjectBytes(s3, bucket, key);
};

const resolveVideoStorageBytes = async (bunnyVideoId) => {
  const videoId = parseBunnyVideoId(bunnyVideoId);
  if (!videoId) return { bytes: 0, missing: true };

  if (!isBunnyStreamConfigured()) {
    return { bytes: 0, missing: true };
  }

  try {
    const bunnyVideo = await getBunnyVideo(videoId);
    const bytes = getBunnyVideoStorageBytes(bunnyVideo);
    return { bytes, missing: bytes <= 0 };
  } catch (error) {
    console.warn(
      `Bunny getVideo failed for ${videoId}:`,
      error.response?.data || error.message || error
    );
    return { bytes: 0, missing: true };
  }
};

const buildImageUpdate = async (post, s3, bucket) => {
  const urls = Array.isArray(post.image_urls) ? post.image_urls : [];
  const imageByteSizes = [];
  let missingImages = 0;

  for (const url of urls) {
    const bytes = await resolveImageBytes(s3, bucket, url);
    imageByteSizes.push(bytes);
    if (!bytes) missingImages += 1;
  }

  const mediaStorageBytes = imageByteSizes.reduce((sum, n) => sum + n, 0);
  return {
    image_byte_sizes: imageByteSizes,
    media_storage_bytes: mediaStorageBytes,
    missingImages,
    missingVideo: false,
  };
};

const buildVideoUpdate = async (post) => {
  const videoId = post.video?.bunny_video_id;
  const resolved = await resolveVideoStorageBytes(videoId);
  const nextVideo = {
    ...(post.video && typeof post.video === 'object' ? post.video : {}),
    bunny_video_id: String(videoId || ''),
    hls_url: post.video?.hls_url || '',
    thumbnail_url: post.video?.thumbnail_url || '',
    duration_seconds: post.video?.duration_seconds ?? null,
    status: post.video?.status || 'processing',
    failure_reason: post.video?.failure_reason || '',
    storage_bytes: resolved.bytes,
  };

  return {
    image_byte_sizes: [],
    media_storage_bytes: resolved.bytes,
    video: nextVideo,
    missingImages: 0,
    missingVideo: resolved.missing,
  };
};

const run = async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DB_URL;
  if (!uri) {
    console.error('Set MONGO_URI, MONGODB_URI, or DB_URL');
    process.exit(1);
  }

  const bucket = String(process.env.AWS_S3_BUCKET || '').trim();
  if (!bucket) {
    console.warn('AWS_S3_BUCKET is not set — image sizes will be 0 unless LOCAL_IMAGE_DIR files exist.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    family: 4,
  });
  console.log(
    `Connected. Backfilling partner_post media_storage_bytes${DRY_RUN ? ' (dry-run)' : ''}...`
  );

  const s3 = createS3Client();
  const filter = INCLUDE_DELETED ? {} : { deleted_at: null };

  let processed = 0;
  let updated = 0;
  let imagePosts = 0;
  let videoPosts = 0;
  let missingImages = 0;
  let missingVideos = 0;
  let lastId = null;

  while (true) {
    const query = { ...filter };
    if (lastId) {
      query._id = { $gt: lastId };
    }

    const batch = await PartnerPost.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_SIZE)
      .select('_id media_type image_urls image_byte_sizes media_storage_bytes video')
      .lean();

    if (batch.length === 0) break;

    const ops = [];
    const now = new Date();

    for (const post of batch) {
      processed += 1;
      lastId = post._id;

      const isVideo =
        post.media_type === POST_MEDIA_TYPE_VIDEO || Boolean(parseBunnyVideoId(post.video?.bunny_video_id));

      let built;
      if (isVideo) {
        videoPosts += 1;
        built = await buildVideoUpdate(post);
      } else {
        imagePosts += 1;
        built = await buildImageUpdate(post, s3, bucket);
      }

      missingImages += built.missingImages;
      if (built.missingVideo) missingVideos += 1;

      const $set = {
        image_byte_sizes: built.image_byte_sizes,
        media_storage_bytes: built.media_storage_bytes,
        updated_at: now,
      };
      if (built.video) {
        $set.video = built.video;
      }

      updated += 1;
      ops.push({
        updateOne: {
          filter: { _id: post._id },
          update: { $set },
        },
      });

      if (DRY_RUN) {
        console.log(
          `dry-run post=${post._id} type=${isVideo ? 'video' : 'image'} bytes=${built.media_storage_bytes}`
        );
      }
    }

    if (!DRY_RUN && ops.length > 0) {
      await PartnerPost.bulkWrite(ops, { ordered: false });
    }

    console.log(`Processed ${processed}, ${DRY_RUN ? 'would_update' : 'updated'} ${updated}...`);
  }

  console.log(
    [
      'Done.',
      `processed=${processed}`,
      `${DRY_RUN ? 'would_update' : 'updated'}=${updated}`,
      `image_posts=${imagePosts}`,
      `video_posts=${videoPosts}`,
      `missing_image_objects=${missingImages}`,
      `missing_or_zero_videos=${missingVideos}`,
    ].join(' ')
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
