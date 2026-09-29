const mongoose = require('mongoose');
const Category = require('../../../models/category');
const Service = require('../../../models/service');
const City = require('../../../models/city');
const Franchise = require('../../../models/franchise');
const User = require('../../../models/user');
const { resolveFranchiseEffectiveCatalog } = require('../../../utils/catalog_availability_resolver');
const {
  resolveFranchiseFromLocation,
  loadSubscribedFranchisePartners,
  loadRandomPlatinumPartnerBanners,
  collectEffectivePartnerOfferings,
  mapFranchisePartnerRecords,
} = require('./franchise_partner_scope');
const {
  enrichPartnerListRecordsWithServiceRatings,
  applyCustomerActiveServicePartnerRatings,
} = require('./partner_rating_service');
const { loadCustomerHomeOrders } = require('./home_orders_service');
const { loadHomeCounts } = require('../common/home_counts_service');
const { toPublicImageUrl } = require('../../../helper/publicImageUrl');

/** Max partners returned on home (highest plan priority first). */
const HOME_PARTNERS_LIMIT = 20;
const HOME_BANNERS_LIMIT = 5;

const { fail, ok } = require('../../../utils/mobile_service_result');

const ACTIVE_CATEGORY_FILTER = {
  deleted_at: null,
  is_active: true,
  is_request: false,
  approval_status: 'approve',
};

const ACTIVE_SERVICE_FILTER = {
  deleted_at: null,
  is_active: true,
  is_request: false,
  approval_status: 'approve',
};

const buildServiceOfferingStats = (effectiveRows) => {
  const aggregate = new Map();

  for (const row of effectiveRows) {
    const serviceKey = String(row.service_id);
    const partnerKey = String(row.partner_id);

    if (!aggregate.has(serviceKey)) {
      aggregate.set(serviceKey, { partnerIds: new Set(), prices: [] });
    }

    const entry = aggregate.get(serviceKey);
    entry.partnerIds.add(partnerKey);

    const price = Number(row.price);
    if (!Number.isNaN(price)) {
      entry.prices.push(price);
    }
  }

  const statsByServiceId = new Map();
  for (const [serviceKey, { partnerIds: offeringPartnerIds, prices }] of aggregate) {
    const partner_count = offeringPartnerIds.size;
    let price_range = null;
    if (prices.length > 0) {
      price_range = {
        min: Math.min(...prices),
        max: Math.max(...prices),
      };
    }
    statsByServiceId.set(serviceKey, { partner_count, price_range });
  }

  return statsByServiceId;
};

const loadCityFranchises = async (cityId) => {
  if (!cityId) return [];
  return Franchise.find({
    deleted_at: null,
    is_active: true,
    city_id: cityId,
  })
    .select('_id name')
    .lean();
};

/**
 * Effective offerings of the given partners, each validated against its own franchise catalog.
 */
const collectCityPartnerOfferings = async (partners) => {
  const partnerIdsByFranchise = new Map();
  for (const partner of partners) {
    if (!partner.franchise_id) continue;
    const franchiseKey = String(partner.franchise_id);
    if (!partnerIdsByFranchise.has(franchiseKey)) {
      partnerIdsByFranchise.set(franchiseKey, {
        franchiseId: partner.franchise_id,
        partnerIds: [],
      });
    }
    partnerIdsByFranchise.get(franchiseKey).partnerIds.push(partner._id);
  }

  const results = await Promise.all(
    [...partnerIdsByFranchise.values()].map(async ({ franchiseId, partnerIds }) => {
      const resolved = await resolveFranchiseEffectiveCatalog(franchiseId);
      if (!resolved.ok) return resolved;
      const offerings = await collectEffectivePartnerOfferings(
        franchiseId,
        (resolved.effectiveServiceIds || []).map((id) => String(id)),
        partnerIds
      );
      return { ok: true, offerings };
    })
  );

  const failed = results.find((result) => !result.ok);
  if (failed) return fail(failed.status, failed.message);

  return { ok: true, offerings: results.flatMap((result) => result.offerings) };
};

/** Categories/services actually offered by the city's subscribed partners. */
const buildCityCategories = async (effectiveOfferings, servicePrice = 0) => {
  const offeringStatsByServiceId = buildServiceOfferingStats(effectiveOfferings);
  const serviceIds = [...offeringStatsByServiceId.keys()];
  if (serviceIds.length === 0) return [];

  const serviceDocs = await Service.find({
    _id: { $in: serviceIds },
    ...ACTIVE_SERVICE_FILTER,
  })
    .select('name desc tax image_url category_id payment_type')
    .lean();
  if (serviceDocs.length === 0) return [];

  const serviceById = new Map(serviceDocs.map((s) => [String(s._id), s]));
  const categoryIds = [
    ...new Set(serviceDocs.map((s) => (s.category_id ? String(s.category_id) : '')).filter(Boolean)),
  ];

  const categories = await Category.find({
    _id: { $in: categoryIds },
    ...ACTIVE_CATEGORY_FILTER,
  })
    .select('name desc image_url services')
    .sort({ created_at: -1 })
    .lean();

  const mapServiceRecord = (s) => {
    const stats = offeringStatsByServiceId.get(String(s._id));
    return {
      _id: s._id,
      name: s.name,
      desc: s.desc,
      tax: s.tax,
      image_url: s.image_url,
      category_id: s.category_id,
      partner_count: stats.partner_count,
      price_range: stats.price_range,
      price: servicePrice,
      payment_type: s.payment_type ?? '',
    };
  };

  return categories
    .map((c) => {
      const catServices = Array.isArray(c.services) ? c.services : [];
      const services = catServices
        .map((id) => (id ? serviceById.get(String(id)) : null))
        .filter((s) => s && String(s.category_id) === String(c._id))
        .map(mapServiceRecord);

      return {
        _id: c._id,
        name: c.name,
        desc: c.desc,
        image_url: c.image_url,
        services,
      };
    })
    .filter((c) => c.services.length > 0);
};

const buildResolvedLocation = (franchiseCtx) => ({
  pincode: franchiseCtx.location.pincode,
  area_name: franchiseCtx.location.area_name,
  city_name: franchiseCtx.location.city_name,
  state_name: franchiseCtx.location.state_name,
  area_id: franchiseCtx.area._id,
  city_id: franchiseCtx.area.city_id,
  state_id: franchiseCtx.area.state_id,
});

const persistCustomerSelectedLocation = async (userId, franchiseCtx) => {
  if (!franchiseCtx?.area?._id) return;

  const setFields = {
    area_id: franchiseCtx.area._id,
    city_id: franchiseCtx.area.city_id,
    state_id: franchiseCtx.area.state_id,
    updated_at: new Date(),
  };
  if (franchiseCtx.location?.pincode) {
    setFields.pincode = franchiseCtx.location.pincode;
  }

  await User.updateOne({ _id: userId, deleted_at: null }, { $set: setFields });
};

const getHomeForLocation = async ({ location, userId }) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return fail(401, 'Invalid token.');
    }

    const [franchiseCtx, orders, home_counts] = await Promise.all([
      resolveFranchiseFromLocation(location, { requireFranchise: false }),
      loadCustomerHomeOrders(userId),
      loadHomeCounts(),
    ]);
    if (!franchiseCtx.ok) return franchiseCtx;

    await persistCustomerSelectedLocation(userId, franchiseCtx);

    const cityId = franchiseCtx.area.city_id;
    const cityFranchises = await loadCityFranchises(cityId);

    const baseData = {
      franchise_id: franchiseCtx.franchise?._id ?? null,
      franchise_name: franchiseCtx.franchise?.name ?? null,
      location: buildResolvedLocation(franchiseCtx),
    };

    if (cityFranchises.length === 0) {
      return ok(200, {
        message: 'Home data fetched successfully.',
        data: {
          services_available: false,
          ...baseData,
          categories: [],
          partners: [],
          banners: [],
          orders,
          home_counts,
        },
      });
    }

    const cityFranchiseIds = cityFranchises.map((f) => f._id);

    const [city, subscribed, banners] = await Promise.all([
      City.findById(cityId).select('city_service_price').lean(),
      loadSubscribedFranchisePartners(cityFranchiseIds),
      loadRandomPlatinumPartnerBanners(cityFranchiseIds, HOME_BANNERS_LIMIT),
    ]);
    const servicePrice = city?.city_service_price ?? 0;

    const offeringsResult = await collectCityPartnerOfferings(subscribed.partners);
    if (!offeringsResult.ok) return offeringsResult;

    const categories = await buildCityCategories(offeringsResult.offerings, servicePrice);

    const partners = mapFranchisePartnerRecords(
      subscribed.partners.slice(0, HOME_PARTNERS_LIMIT),
      subscribed.planByPartnerId,
      offeringsResult.offerings
    );
    const partnersWithServiceRatings = await enrichPartnerListRecordsWithServiceRatings(partners);
    const partnersWithRatings = await applyCustomerActiveServicePartnerRatings(
      partnersWithServiceRatings
    );

    return ok(200, {
      message: 'Home data fetched successfully.',
      data: {
        services_available: true,
        ...baseData,
        categories,
        partners: partnersWithRatings,
        banners: banners.map(toPublicImageUrl),
        orders,
        home_counts,
      },
    });
  } catch (err) {
    console.error('mobile user home', err.message);
    return fail(500, 'Technical issue. Please try again..');
  }
};

module.exports = {
  getHomeForLocation,
};
