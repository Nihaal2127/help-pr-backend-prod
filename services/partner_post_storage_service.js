const PartnerPost = require('../models/partner_post');
const PartnerSubscription = require('../models/partner_subscription');
const {
  DEFAULT_PARTNER_PLAN_NAME,
  PLATINUM_PLAN_NAME,
} = require('../constants/partner_subscription');
const {
  BYTES_PER_GB,
  PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN,
} = require('../constants/partner_post_storage');
const { getBunnyVideo } = require('./bunny_stream_service');
const { parseBunnyVideoId } = require('../enum/post_media_enum');

const fail = (status, message) => ({ ok: false, status, message });
const ok = (status, data) => ({ ok: true, status, data });

const formatGb = (bytes) => {
  const n = Number(bytes) || 0;
  const gb = n / BYTES_PER_GB;
  if (gb >= 10) return gb.toFixed(1);
  if (gb >= 1) return gb.toFixed(2);
  const mb = n / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(0, Math.round(n))} bytes`;
};

const normalizePlanName = (raw) => {
  const name = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN, name)) {
    return name;
  }
  return DEFAULT_PARTNER_PLAN_NAME;
};

const getStorageLimitBytesForPlan = (planName) => {
  const key = normalizePlanName(planName);
  if (key === PLATINUM_PLAN_NAME) return null;
  const limit = PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN[key];
  return limit == null ? null : limit;
};

const sumUploadFileBytes = (files = []) =>
  (Array.isArray(files) ? files : []).reduce((sum, file) => {
    const fromSize = Number(file?.size);
    if (Number.isFinite(fromSize) && fromSize > 0) return sum + Math.floor(fromSize);
    const fromBuffer = file?.buffer?.length;
    if (Number.isFinite(fromBuffer) && fromBuffer > 0) return sum + fromBuffer;
    return sum;
  }, 0);

const collectImageByteSizes = (files = []) =>
  (Array.isArray(files) ? files : []).map((file) => {
    const fromSize = Number(file?.size);
    if (Number.isFinite(fromSize) && fromSize >= 0) return Math.floor(fromSize);
    const fromBuffer = file?.buffer?.length;
    if (Number.isFinite(fromBuffer) && fromBuffer >= 0) return fromBuffer;
    return 0;
  });

const getBunnyVideoStorageBytes = (bunnyVideo) => {
  const n = Number(bunnyVideo?.storageSize ?? bunnyVideo?.storage_size ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const resolveBunnyVideoStorageBytes = async (bunnyVideoId) => {
  const videoId = parseBunnyVideoId(bunnyVideoId);
  if (!videoId) {
    return fail(400, 'Invalid video id.');
  }
  try {
    const bunnyVideo = await getBunnyVideo(videoId);
    const bytes = getBunnyVideoStorageBytes(bunnyVideo);
    if (bytes <= 0) {
      return fail(
        400,
        'Video file size could not be determined yet. Finish the upload and try again.'
      );
    }
    return ok(200, { videoId, bytes, bunnyVideo });
  } catch (error) {
    console.error('resolveBunnyVideoStorageBytes', videoId, error.response?.data || error.message);
    return fail(400, 'Unable to verify video storage size. Try again shortly.');
  }
};

const getPartnerPlanNameForStorage = async (partnerOid) => {
  const now = new Date();
  const row = await PartnerSubscription.findOne({
    partner_id: partnerOid,
    status: 'active',
    deleted_at: null,
    $or: [{ expires_at: null }, { expires_at: { $gt: now } }],
  })
    .sort({ created_at: -1 })
    .populate('subscription_plan_id', 'plan_name')
    .lean();

  const planName = row?.subscription_plan_id?.plan_name;
  return normalizePlanName(planName);
};

const getPartnerPostStorageUsedBytes = async (partnerOid, { excludePostId = null } = {}) => {
  const match = {
    partner_id: partnerOid,
    deleted_at: null,
  };
  if (excludePostId) {
    match._id = { $ne: excludePostId };
  }

  const rows = await PartnerPost.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ['$media_storage_bytes', 0] } },
      },
    },
  ]);

  const total = Number(rows[0]?.total) || 0;
  return total > 0 ? Math.floor(total) : 0;
};

const buildLimitExceededMessage = (planName, usedBytes, limitBytes, additionalBytes) => {
  const planLabel = String(planName).charAt(0).toUpperCase() + String(planName).slice(1);
  const limitLabel =
    limitBytes >= BYTES_PER_GB ? `${limitBytes / BYTES_PER_GB} GB` : formatGb(limitBytes);
  const projected = usedBytes + additionalBytes;
  return (
    `Storage limit exceeded for your ${planLabel} plan ` +
    `(${formatGb(projected)} used of ${limitLabel} allowed for partner posts). ` +
    `Delete existing posts or upgrade your plan to upload more.`
  );
};

/**
 * Ensures partner can add `additionalBytes` of partner-post media.
 * Soft-deleted posts are excluded. Pass excludePostId when replacing media on an existing post.
 */
const assertPartnerPostStorageAllows = async (
  partnerOid,
  additionalBytes,
  { excludePostId = null } = {}
) => {
  const needed = Math.max(0, Math.floor(Number(additionalBytes) || 0));
  const planName = await getPartnerPlanNameForStorage(partnerOid);
  const limitBytes = getStorageLimitBytesForPlan(planName);

  if (limitBytes == null) {
    return ok(200, {
      planName,
      limitBytes: null,
      usedBytes: null,
      additionalBytes: needed,
      unlimited: true,
    });
  }

  const usedBytes = await getPartnerPostStorageUsedBytes(partnerOid, { excludePostId });
  if (usedBytes + needed > limitBytes) {
    return fail(400, buildLimitExceededMessage(planName, usedBytes, limitBytes, needed));
  }

  return ok(200, {
    planName,
    limitBytes,
    usedBytes,
    additionalBytes: needed,
    unlimited: false,
  });
};

const sumImageByteSizesForUrls = (urls = [], byteSizes = [], keepUrls = []) => {
  const sizeByUrl = new Map();
  const urlList = Array.isArray(urls) ? urls : [];
  const sizeList = Array.isArray(byteSizes) ? byteSizes : [];
  urlList.forEach((url, index) => {
    const key = String(url || '').trim();
    if (!key) return;
    const size = Number(sizeList[index]) || 0;
    sizeByUrl.set(key, size > 0 ? Math.floor(size) : 0);
  });

  return (Array.isArray(keepUrls) ? keepUrls : []).reduce((sum, url) => {
    const key = String(url || '').trim();
    return sum + (sizeByUrl.get(key) || 0);
  }, 0);
};

module.exports = {
  BYTES_PER_GB,
  PARTNER_POST_STORAGE_LIMIT_BYTES_BY_PLAN,
  formatGb,
  normalizePlanName,
  getStorageLimitBytesForPlan,
  sumUploadFileBytes,
  collectImageByteSizes,
  getBunnyVideoStorageBytes,
  resolveBunnyVideoStorageBytes,
  getPartnerPlanNameForStorage,
  getPartnerPostStorageUsedBytes,
  assertPartnerPostStorageAllows,
  sumImageByteSizesForUrls,
};
