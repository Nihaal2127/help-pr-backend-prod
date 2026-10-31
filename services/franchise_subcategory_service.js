const mongoose = require('mongoose');
const { fieldLabel } = require('../utils/field_labels');
const Franchise = require('../models/franchise');
const Subcategory = require('../models/subcategory');
const Service = require('../models/service');
const User = require('../models/user');
const {
    annotateCatalogRowWithAvailability,
    isGlobalCatalogRowActive,
} = require('../utils/catalog_availability_resolver');
const { resolveFranchiseCatalogListScope } = require('../utils/franchise_user_scope');
const {
    buildEnabledMapFromFranchiseIds,
    GLOBAL_ACTIVE_CATEGORY_FILTER,
    paginateArray,
} = require('../utils/franchise_catalog_from_franchise');
const { getFranchiseUserIdsForScope } = require('../utils/franchise_catalog_dashboard_counts');

const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });
const ok = (status, data) => ({ ok: true, status, data });

const GLOBAL_ACTIVE_SUBCATEGORY_FILTER = GLOBAL_ACTIVE_CATEGORY_FILTER;

const FRANCHISE_LIST_SELECT =
    '_id name admin_name is_active admin_id subcategories created_at updated_at';

const RELATED_SERVICE_FIELDS =
    'name desc image_url category_id subcategory_id is_active is_request service_id tax commission payment_type minimum_deposit approval_status rejection_reason requested_by created_at updated_at';

const parseOptionalQueryBool = (raw, fieldName) => {
    if (raw === undefined || raw === null) return { ok: true, present: false };
    const s = String(raw).trim().toLowerCase();
    if (s === '') return { ok: true, present: false };
    if (s === 'true' || s === '1') return { ok: true, present: true, value: true };
    if (s === 'false' || s === '0') return { ok: true, present: true, value: false };
    return { ok: false, message: `${fieldLabel(fieldName)} must be true or false.` };
};

const hasFranchiseIdQueryParam = (query) => {
    const raw = query?.franchise_id;
    return raw !== undefined && raw !== null && String(raw).trim() !== '';
};

const resolveEffectiveIsRequestFilter = (query, listFlags) => {
    if (listFlags.isRequestFilter !== undefined) return listFlags.isRequestFilter;
    if (hasFranchiseIdQueryParam(query)) return false;
    return undefined;
};

const resolveFranchiseMappingListQuery = (query) => {
    const m = parseOptionalQueryBool(query.is_active, 'is_active');
    if (!m.ok) return { ok: false, message: m.message };
    const r = parseOptionalQueryBool(query.is_request, 'is_request');
    if (!r.ok) return { ok: false, message: r.message };
    return {
        ok: true,
        mappingActiveFilter: m.present ? m.value : undefined,
        isRequestFilter: r.present ? r.value : undefined,
    };
};

const toIdStr = (id) => (id ? id.toString() : '');

const loadServicesGroupedBySubcategoryId = async (subcategories) => {
    const map = new Map();
    if (!subcategories || subcategories.length === 0) return map;

    const uniqueSubIds = [
        ...new Set(subcategories.map((s) => toIdStr(s._id)).filter(Boolean)),
    ];
    if (uniqueSubIds.length === 0) return map;

    const subOids = uniqueSubIds.map((s) => new mongoose.Types.ObjectId(s));
    const rowsByField = await Service.find({
        deleted_at: null,
        subcategory_id: { $in: subOids },
    })
        .select(RELATED_SERVICE_FIELDS)
        .sort({ name: 1 })
        .lean();

    const seenBySub = new Map();
    const pushService = (subKey, svc) => {
        if (!subKey || !svc || !svc._id) return;
        if (!seenBySub.has(subKey)) seenBySub.set(subKey, new Set());
        const seen = seenBySub.get(subKey);
        const sid = toIdStr(svc._id);
        if (!sid || seen.has(sid)) return;
        seen.add(sid);
        if (!map.has(subKey)) map.set(subKey, []);
        map.get(subKey).push(svc);
    };

    for (const s of rowsByField) {
        pushService(toIdStr(s.subcategory_id), s);
    }

    const missingIds = [];
    const missingOwner = new Map();
    for (const sub of subcategories) {
        const subKey = toIdStr(sub._id);
        const listed = Array.isArray(sub.services) ? sub.services : [];
        for (const sidRaw of listed) {
            const sid = toIdStr(sidRaw);
            if (!sid) continue;
            const seen = seenBySub.get(subKey);
            if (seen && seen.has(sid)) continue;
            missingIds.push(sid);
            if (!missingOwner.has(sid)) missingOwner.set(sid, []);
            missingOwner.get(sid).push(subKey);
        }
    }

    const uniqueMissing = [...new Set(missingIds)];
    if (uniqueMissing.length > 0) {
        const extra = await Service.find({
            deleted_at: null,
            _id: { $in: uniqueMissing.map((s) => new mongoose.Types.ObjectId(s)) },
        })
            .select(RELATED_SERVICE_FIELDS)
            .sort({ name: 1 })
            .lean();
        for (const svc of extra) {
            const owners = missingOwner.get(toIdStr(svc._id)) || [];
            for (const subKey of owners) {
                pushService(subKey, svc);
            }
        }
    }

    for (const [key, list] of map.entries()) {
        list.sort((a, b) => {
            const na = (a.name != null ? String(a.name) : '').toLowerCase();
            const nb = (b.name != null ? String(b.name) : '').toLowerCase();
            return na.localeCompare(nb);
        });
        map.set(key, list);
    }

    return map;
};

const attachRequestedByUser = async (records) => {
    if (!Array.isArray(records) || records.length === 0) return records;

    const requestedByIds = [
        ...new Set(
            records
                .map((record) => record?.requested_by)
                .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
                .map((id) => String(id))
        ),
    ];

    if (requestedByIds.length === 0) return records;

    const users = await User.find({
        _id: { $in: requestedByIds },
        deleted_at: null,
    }).select('name');

    const userMap = new Map(users.map((user) => [String(user._id), user]));

    return records.map((record) => {
        const plainRecord =
            record && typeof record.toObject === 'function' ? record.toObject() : record;
        const requestedById = plainRecord?.requested_by ? String(plainRecord.requested_by) : null;
        const requestedByUser = requestedById ? userMap.get(requestedById) : null;
        return {
            ...plainRecord,
            requested_by: requestedByUser
                ? { id: requestedByUser._id, name: requestedByUser.name }
                : plainRecord.requested_by,
        };
    });
};

const annotateSubcategoryRows = async (rows, franchiseOid) => {
    const franchise = await Franchise.findOne({
        _id: franchiseOid,
        deleted_at: null,
    })
        .select('subcategories')
        .lean();
    const franchiseEnabledMap = buildEnabledMapFromFranchiseIds(franchise?.subcategories || []);
    const svcMap = await loadServicesGroupedBySubcategoryId(rows);

    return rows.map((sub) => {
        const key = sub._id.toString();
        const globalActive = isGlobalCatalogRowActive(sub);
        const franchiseEnabled = franchiseEnabledMap.get(key) === true;
        return annotateCatalogRowWithAvailability(
            {
                ...sub,
                related_services: svcMap.get(key) || [],
            },
            { kind: 'category', globalActive, franchiseEnabled }
        );
    });
};

const buildAllSubcategoriesWithFranchiseMappingStatus = async (franchiseOid) => {
    const allSubs = await Subcategory.find(GLOBAL_ACTIVE_SUBCATEGORY_FILTER).lean();
    return annotateSubcategoryRows(allSubs, franchiseOid);
};

const buildFranchiseRequestSubcategories = async (franchiseOid) => {
    const franchiseUserIds = await getFranchiseUserIdsForScope([franchiseOid]);
    if (franchiseUserIds.length === 0) return [];

    const requestSubs = await Subcategory.find({
        deleted_at: null,
        is_request: true,
        requested_by: { $in: franchiseUserIds },
    }).lean();

    const rows = await annotateSubcategoryRows(requestSubs, franchiseOid);
    return attachRequestedByUser(rows);
};

const matchesSearchInSubcategoryName = (sub, qLower) => {
    const n = sub.name != null ? String(sub.name).toLowerCase() : '';
    return n.includes(qLower);
};

const matchesSearchInRelatedServices = (sub, qLower) => {
    const svcs = sub.related_services || [];
    return svcs.some((s) => {
        const n = s.name != null ? String(s.name).toLowerCase() : '';
        return n.includes(qLower);
    });
};

const filterAllSubcategoriesBySearch = (rows, searchRaw) => {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const trimmed =
        searchRaw !== undefined && searchRaw !== null ? String(searchRaw).trim() : '';
    if (!trimmed) return rows;
    const qLower = trimmed.toLowerCase();

    const nameHits = rows.filter((sub) => matchesSearchInSubcategoryName(sub, qLower));
    if (nameHits.length > 0) return nameHits;

    return rows.filter((sub) => matchesSearchInRelatedServices(sub, qLower));
};

const parseFranchiseSubcategoryCatalogSort = (query) => {
    const sortByRaw = query.sort_by;
    const sortOrderRaw = query.sort_order ?? query.order;

    let sortBy = 'name';
    if (sortByRaw !== undefined && sortByRaw !== null && String(sortByRaw).trim() !== '') {
        const s = String(sortByRaw).trim().toLowerCase();
        if (s !== 'name' && s !== 'id' && s !== '_id') {
            return { ok: false, message: 'Sort field must be name or id.' };
        }
        sortBy = s === '_id' ? 'id' : s;
    }

    let sortOrder = 1;
    if (sortOrderRaw !== undefined && sortOrderRaw !== null && String(sortOrderRaw).trim() !== '') {
        const o = String(sortOrderRaw).trim().toLowerCase();
        if (o !== 'asc' && o !== 'desc') {
            return { ok: false, message: 'Sort order must be asc or desc.' };
        }
        sortOrder = o === 'desc' ? -1 : 1;
    }

    return { ok: true, sortBy, sortOrder };
};

const sortAllSubcategoriesRows = (rows, sortBy, sortOrder) => {
    if (!Array.isArray(rows) || rows.length === 0) return rows;
    const mult = sortOrder;
    const copy = [...rows];
    copy.sort((a, b) => {
        if (sortBy === 'id') {
            const sa = a._id.toString();
            const sb = b._id.toString();
            return mult * sa.localeCompare(sb);
        }
        const na = (a.name != null ? String(a.name) : '').toLowerCase();
        const nb = (b.name != null ? String(b.name) : '').toLowerCase();
        return mult * na.localeCompare(nb);
    });
    return copy;
};

const franchiseMetaFromDoc = (franchise) =>
    franchise
        ? {
              _id: franchise._id,
              name: franchise.name,
              admin_name: franchise.admin_name ?? null,
              is_active: franchise.is_active,
          }
        : null;

const list = async (query, userId) => {
    try {
        const page = parseInt(query.page, 10) || 1;
        const limit = parseInt(query.limit, 10) || 10;

        const scope = await resolveFranchiseCatalogListScope(query, userId);
        if (!scope.ok) return fail(scope.status, scope.message);

        const listFlags = resolveFranchiseMappingListQuery(query);
        if (!listFlags.ok) return fail(400, listFlags.message);
        const isRequestFilter = resolveEffectiveIsRequestFilter(query, listFlags);

        const franchise = await Franchise.findOne({
            _id: scope.franchiseOid,
            deleted_at: null,
        })
            .select(FRANCHISE_LIST_SELECT)
            .lean();
        if (!franchise) return fail(404, 'Franchise not found.');

        const sortOpts = parseFranchiseSubcategoryCatalogSort(query);
        if (!sortOpts.ok) return fail(400, sortOpts.message);

        let subcategories =
            isRequestFilter === true
                ? await buildFranchiseRequestSubcategories(scope.franchiseOid)
                : await buildAllSubcategoriesWithFranchiseMappingStatus(scope.franchiseOid);

        if (listFlags.mappingActiveFilter !== undefined) {
            subcategories = subcategories.filter(
                (sub) => Boolean(sub.franchise_enabled) === listFlags.mappingActiveFilter
            );
        }
        if (isRequestFilter === false) {
            subcategories = subcategories.filter((sub) => Boolean(sub.is_request) === false);
        }

        const searchTerm = query.search ?? query.q;
        subcategories = filterAllSubcategoriesBySearch(subcategories, searchTerm);
        subcategories = sortAllSubcategoriesRows(subcategories, sortOpts.sortBy, sortOpts.sortOrder);

        const { data, totalItems, totalPages, currentPage } = paginateArray(
            subcategories,
            page,
            limit
        );

        return ok(200, {
            message: 'Franchise subcategory list fetched successfully.',
            franchise: franchiseMetaFromDoc(franchise),
            subcategories: data,
            totalItems,
            totalPages,
            currentPage,
        });
    } catch (error) {
        console.error('franchiseSubcategory.list', error.message);
        return fail(500, 'Technical issue. Please try again..');
    }
};

module.exports = {
    list,
};
