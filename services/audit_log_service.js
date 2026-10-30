const mongoose = require('mongoose');
const AuditLog = require('../models/audit_log');
const User = require('../models/user');
const Franchise = require('../models/franchise');
const { sanitizeInput } = require('../validator/search_keyword_validator');

const fail = (status, message, extra = {}) => ({ ok: false, status, message, ...extra });
const ok = (status, data) => ({ ok: true, status, data });

const MAX_PAGE_SIZE = 100;
const MAX_DESCRIPTION_LEN = 2000;

const toObjectIdOrNull = (raw) => {
    if (!raw) return null;
    if (raw instanceof mongoose.Types.ObjectId) return raw;
    const s = String(raw).trim();
    if (!s || !mongoose.Types.ObjectId.isValid(s)) return null;
    return new mongoose.Types.ObjectId(s);
};

const truncate = (value, max = MAX_DESCRIPTION_LEN) => {
    if (value === undefined || value === null) return '';
    const s = String(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
};

/**
 * Fire-and-forget insert. Never throws to callers.
 */
const writeAuditLog = async (payload = {}) => {
    try {
        const moduleName =
            payload.module !== undefined && payload.module !== null
                ? String(payload.module).trim()
                : '';
        const action =
            payload.action !== undefined && payload.action !== null
                ? String(payload.action).trim()
                : '';
        if (!moduleName || !action) return null;

        let performedBy = toObjectIdOrNull(payload.performed_by);
        let performedByName =
            payload.performed_by_name !== undefined && payload.performed_by_name !== null
                ? String(payload.performed_by_name).trim() || null
                : null;
        let franchiseId = toObjectIdOrNull(payload.franchise_id);
        let franchiseName =
            payload.franchise_name !== undefined && payload.franchise_name !== null
                ? String(payload.franchise_name).trim() || null
                : null;

        if (performedBy && !performedByName) {
            const user = await User.findOne({ _id: performedBy, deleted_at: null })
                .select('name email phone_number franchise_id')
                .lean();
            if (user) {
                performedByName = user.name || user.email || user.phone_number || null;
                if (!franchiseId && user.franchise_id) {
                    franchiseId = user.franchise_id;
                }
            }
        }

        if (franchiseId && !franchiseName) {
            const franchise = await Franchise.findOne({ _id: franchiseId, deleted_at: null })
                .select('name')
                .lean();
            if (franchise) franchiseName = franchise.name || null;
        }

        const referenceId = toObjectIdOrNull(payload.reference_id);
        const referenceType =
            payload.reference_type !== undefined && payload.reference_type !== null
                ? String(payload.reference_type).trim() || null
                : null;
        let reference =
            payload.reference !== undefined && payload.reference !== null
                ? String(payload.reference).trim() || null
                : null;
        if (!reference && (referenceType || referenceId)) {
            reference = [referenceType, referenceId ? String(referenceId) : null]
                .filter(Boolean)
                .join(':');
        }

        const statusRaw = String(payload.status || 'success').trim().toLowerCase();
        const status = statusRaw === 'failed' ? 'failed' : 'success';

        const sourceRaw = String(payload.source || 'unknown').trim().toLowerCase();
        const allowedSources = new Set(['admin', 'mobile', 'webhook', 'system', 'unknown']);
        const source = allowedSources.has(sourceRaw) ? sourceRaw : 'unknown';

        const doc = await AuditLog.create({
            module: moduleName,
            action,
            reference,
            reference_type: referenceType,
            reference_id: referenceId,
            description: truncate(payload.description || ''),
            performed_by: performedBy,
            performed_by_name: performedByName,
            franchise_id: franchiseId,
            franchise_name: franchiseName,
            status,
            source,
            method: payload.method ? String(payload.method).trim() : null,
            path: payload.path ? String(payload.path).trim() : null,
            http_status:
                payload.http_status !== undefined && payload.http_status !== null
                    ? Number(payload.http_status)
                    : null,
            ip: payload.ip ? String(payload.ip).trim() : null,
            error_message: payload.error_message
                ? truncate(payload.error_message, 1000)
                : null,
            created_at: payload.created_at ? new Date(payload.created_at) : new Date(),
        });
        return doc;
    } catch (err) {
        console.error('writeAuditLog', err.message);
        return null;
    }
};

const parseOptionalDate = (raw, fieldName) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return { ok: true, value: undefined };
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
        return { ok: false, message: `${fieldName} must be a valid date.` };
    }
    return { ok: true, value: d };
};

const listAuditLogs = async (query = {}) => {
    try {
        let page = parseInt(query.page, 10);
        let limit = parseInt(query.limit, 10);
        if (!Number.isFinite(page) || page < 1) page = 1;
        if (!Number.isFinite(limit) || limit < 1) limit = 10;
        if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

        const filter = {};

        const from = parseOptionalDate(query.from_date ?? query.fromDate ?? query.from, 'from_date');
        if (!from.ok) return fail(400, from.message);
        const to = parseOptionalDate(query.to_date ?? query.toDate ?? query.to, 'to_date');
        if (!to.ok) return fail(400, to.message);
        if (from.value || to.value) {
            filter.created_at = {};
            if (from.value) filter.created_at.$gte = from.value;
            if (to.value) {
                const end = new Date(to.value);
                if (
                    end.getHours() === 0 &&
                    end.getMinutes() === 0 &&
                    end.getSeconds() === 0 &&
                    end.getMilliseconds() === 0
                ) {
                    end.setHours(23, 59, 59, 999);
                }
                filter.created_at.$lte = end;
            }
        }

        if (query.module) {
            filter.module = String(query.module).trim();
        }
        if (query.action) {
            filter.action = String(query.action).trim();
        }
        if (query.status) {
            const s = String(query.status).trim().toLowerCase();
            if (s === 'success' || s === 'failed') filter.status = s;
        }
        if (query.franchise_id) {
            const fid = toObjectIdOrNull(query.franchise_id);
            if (!fid) return fail(400, 'Franchise must be a valid MongoDB ObjectId.');
            filter.franchise_id = fid;
        }
        if (query.performed_by) {
            const uid = toObjectIdOrNull(query.performed_by);
            if (!uid) return fail(400, 'Performed by must be a valid MongoDB ObjectId.');
            filter.performed_by = uid;
        }

        const searchRaw = query.search ?? query.q ?? query.keyword;
        if (searchRaw !== undefined && searchRaw !== null && String(searchRaw).trim() !== '') {
            const pattern = new RegExp(sanitizeInput(String(searchRaw).trim()), 'i');
            filter.$or = [
                { module: { $regex: pattern } },
                { action: { $regex: pattern } },
                { reference: { $regex: pattern } },
                { description: { $regex: pattern } },
                { performed_by_name: { $regex: pattern } },
                { franchise_name: { $regex: pattern } },
            ];
        }

        const skip = (page - 1) * limit;
        const [totalItems, rows] = await Promise.all([
            AuditLog.countDocuments(filter),
            AuditLog.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
        ]);

        const totalPages = Math.max(1, Math.ceil(totalItems / limit) || 1);
        const records = rows.map((row, index) => ({
            s_no: skip + index + 1,
            _id: row._id,
            created_at: row.created_at,
            module: row.module,
            action: row.action,
            reference: row.reference,
            reference_type: row.reference_type,
            reference_id: row.reference_id,
            description: row.description,
            performed_by: row.performed_by,
            performed_by_name: row.performed_by_name,
            franchise_id: row.franchise_id,
            franchise_name: row.franchise_name,
            status: row.status,
            source: row.source,
            method: row.method,
            path: row.path,
            http_status: row.http_status,
            ip: row.ip,
            error_message: row.error_message,
        }));

        return ok(200, {
            message: 'Audit log list fetched successfully.',
            totalItems,
            totalPages,
            currentPage: page,
            records,
        });
    } catch (err) {
        console.error('listAuditLogs', err.message);
        return fail(500, 'Technical issue. Please try again..');
    }
};

module.exports = {
    writeAuditLog,
    listAuditLogs,
};
