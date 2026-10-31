const mongoose = require('mongoose');
const Category = require('../../../models/category');
const Service = require('../../../models/service');
const City = require('../../../models/city');
const User = require('../../../models/user');
const { fieldLabel } = require('../../../utils/field_labels');
const {
  resolveFranchiseFromLocation,
  loadSubscribedCityPartners,
  loadRandomPlatinumPartnerBanners,
  resolveCityEffectiveCatalog,
  mapFranchisePartnerRecords,
  loadActiveSubcategoriesForCategories,
  nestMappedServicesUnderSubcategories,
} = require('./franchise_partner_scope');
const { enrichPartnerListRecordsWithServiceRatings } = require('./partner_rating_service');
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

const parseOptionalCityId = (raw) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, value: null };
  }
  const cityId = String(raw).trim();
  if (!mongoose.Types.ObjectId.isValid(cityId)) {
    return { ok: false, status: 400, message: `${fieldLabel('city_id')} must be a valid ObjectId.` };
  }
  return { ok: true, value: cityId };
};

const buildCityCategories = async (cityId, servicePrice = 0, subscribedPartners = []) => {
  const resolved = await resolveCityEffectiveCatalog(cityId, subscribedPartners);
  if (!resolved.ok) {
    return fail(resolved.status, resolved.message);
  }

  const ids = resolved.effectiveCategoryIds || [];
  if (ids.length === 0) {
    return { ok: true, categories: [], effectiveOfferings: resolved.effectiveOfferings || [] };
  }

  const effectiveSvcSet = new Set((resolved.effectiveServiceIds || []).map((x) => String(x)));

  const categories = await Category.find({
    _id: { $in: ids },
    ...ACTIVE_CATEGORY_FILTER,
  })
    .select('name desc image_url services')
    .sort({ created_at: -1 })
    .lean();

  const serviceIdSet = new Set();
  for (const category of categories) {
    const catServices = Array.isArray(category.services) ? category.services : [];
    for (const sid of catServices) {
      if (sid && effectiveSvcSet.has(String(sid))) {
        serviceIdSet.add(String(sid));
      }
    }
  }

  const serviceDocs =
    serviceIdSet.size === 0
      ? []
      : await Service.find({
          _id: { $in: [...serviceIdSet] },
          ...ACTIVE_SERVICE_FILTER,
        })
          .select('name desc tax image_url category_id payment_type direct_order')
          .lean();

  const serviceById = new Map(serviceDocs.map((s) => [String(s._id), s]));
  const subcategories = await loadActiveSubcategoriesForCategories(categories.map((c) => c._id));

  const effectiveOfferings = resolved.effectiveOfferings || [];
  const offeringStatsByServiceId = buildServiceOfferingStats(effectiveOfferings);

  const mapServiceRecord = (s) => {
    const stats = offeringStatsByServiceId.get(String(s._id)) || {
      partner_count: 0,
      price_range: null,
    };
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
      direct_order: s.direct_order !== false,
    };
  };

  const categoriesWithServices = categories.map((c) => {
    const catServices = Array.isArray(c.services) ? c.services : [];
    const intersectionIds = catServices.filter((sid) => sid && effectiveSvcSet.has(String(sid)));
    const services = intersectionIds
      .map((id) => serviceById.get(String(id)))
      .filter((s) => s && String(s.category_id) === String(c._id))
      .map(mapServiceRecord);
    const nested = nestMappedServicesUnderSubcategories(c._id, services, subcategories);

    return {
      _id: c._id,
      name: c.name,
      desc: c.desc,
      image_url: c.image_url,
      subcategories: nested.subcategories,
      ...(nested.leftoverServices.length > 0 ? { services: nested.leftoverServices } : {}),
    };
  });

  return {
    ok: true,
    categories: categoriesWithServices,
    effectiveOfferings,
  };
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

const getHomeForLocation = async ({ location, userId, cityId }) => {
  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
      return fail(401, 'Invalid token.');
    }

    const parsedCityId = parseOptionalCityId(cityId);
    if (!parsedCityId.ok) return fail(parsedCityId.status, parsedCityId.message);

    const [franchiseCtx, orders, home_counts] = await Promise.all([
      resolveFranchiseFromLocation(location, { requireFranchise: false, byCity: false }),
      loadCustomerHomeOrders(userId),
      loadHomeCounts(),
    ]);
    if (!franchiseCtx.ok) return franchiseCtx;

    await persistCustomerSelectedLocation(userId, franchiseCtx);

    let catalogCityId = parsedCityId.value;
    let servicePrice = 0;
    if (catalogCityId) {
      const city = await City.findOne({ _id: catalogCityId, deleted_at: null })
        .select('city_service_price')
        .lean();
      if (!city) {
        return fail(404, 'City not found.');
      }
      servicePrice = city.city_service_price ?? 0;
    } else {
      catalogCityId = franchiseCtx.area?.city_id ?? null;
      if (catalogCityId) {
        const city = await City.findById(catalogCityId).select('city_service_price').lean();
        servicePrice = city?.city_service_price ?? 0;
      }
    }

    if (!catalogCityId) {
      return ok(200, {
        message: 'Home data fetched successfully.',
        data: {
          services_available: false,
          franchise_id: franchiseCtx.franchise?._id ?? null,
          franchise_name: franchiseCtx.franchise?.name ?? null,
          location: buildResolvedLocation(franchiseCtx),
          categories: [],
          partners: [],
          banners: [],
          orders,
          home_counts,
        },
      });
    }

    const [subscribed, banners] = await Promise.all([
      loadSubscribedCityPartners(catalogCityId, {
        limit: HOME_PARTNERS_LIMIT,
      }),
      loadRandomPlatinumPartnerBanners(null, HOME_BANNERS_LIMIT, {
        cityOnly: true,
        cityId: catalogCityId,
      }),
    ]);

    const catalogResult = await buildCityCategories(
      catalogCityId,
      servicePrice,
      subscribed.partners
    );
    if (!catalogResult.ok) return catalogResult;

    const partners = mapFranchisePartnerRecords(
      subscribed.partners,
      subscribed.planByPartnerId,
      catalogResult.effectiveOfferings || []
    );
    const partnersWithRatings = await enrichPartnerListRecordsWithServiceRatings(partners);
    const hasCatalog =
      catalogResult.categories.length > 0 || partnersWithRatings.length > 0;

    return ok(200, {
      message: 'Home data fetched successfully.',
      data: {
        services_available: hasCatalog,
        franchise_id: franchiseCtx.franchise?._id ?? null,
        franchise_name: franchiseCtx.franchise?.name ?? null,
        location: buildResolvedLocation(franchiseCtx),
        categories: catalogResult.categories,
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
