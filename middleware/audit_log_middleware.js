const { writeAuditLog } = require('../services/audit_log_service');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PATH_PREFIXES = [
    '/health',
    '/.well-known',
    '/api/audit-log',
    '/api/otp',
    '/api/dashboard',
    '/api/export',
    '/api/count',
    '/api/user_home_counts',
];

const SENSITIVE_KEYS = new Set([
    'password',
    'new_password',
    'old_password',
    'confirm_password',
    'token',
    'access_token',
    'refresh_token',
    'otp',
    'authorization',
    'secret',
    'card_number',
    'cvv',
]);

const MODULE_LABELS = {
    auth: 'Auth',
    user: 'User Management',
    state: 'Location Management',
    city: 'Location Management',
    area: 'Location Management',
    franchise: 'Franchise Management',
    'franchise-category': 'Franchise Management',
    'franchise-service': 'Franchise Management',
    category: 'Service Management',
    subcategory: 'Service Management',
    service: 'Service Management',
    'subscription-plan': 'Partner Management',
    offer: 'Financials',
    'partner-subscription': 'Partner Management',
    partner_service: 'Partner Management',
    partner_category: 'Partner Management',
    partner_document: 'Partner Management',
    document: 'Partner Management',
    document_upload: 'Partner Management',
    bank_account: 'Financials',
    order: 'Order Management',
    'order-additional-charges': 'Order Management',
    'order-payments': 'Order Management',
    order_service: 'Order Management',
    quote: 'Quote Management',
    quote_settings: 'Quote Management',
    address: 'User Management',
    tax: 'Financials',
    ticket: 'Support Center',
    dispute: 'Support Center',
    notification_settings: 'Notifications',
    notifications: 'Notifications',
    notification: 'Notifications',
    razorpay: 'Financials',
    'content-management': 'Content Management',
    'expense-category-management': 'Expenses Management',
    'expense-management': 'Expenses Management',
    partner_payout: 'Financials',
    refund: 'Financials',
    'partner-post': 'Partner Management',
    partners: 'Partner Management',
    appointment: 'Calendar',
    mobile: 'Mobile',
};

const titleCaseSegment = (segment) =>
    String(segment || '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

const resolveModule = (pathName) => {
    const parts = String(pathName || '')
        .split('?')[0]
        .split('/')
        .filter(Boolean);
    if (parts[0] !== 'api') return 'System';
    if (parts[1] === 'mobile') {
        const area = parts[2] || 'mobile';
        const resource = parts[3] || '';
        return `Mobile ${titleCaseSegment(area)}${resource ? ` / ${titleCaseSegment(resource)}` : ''}`;
    }
    const key = parts[1] || '';
    return MODULE_LABELS[key] || titleCaseSegment(key) || 'System';
};

const resolveAction = (method, pathName) => {
    const lower = String(pathName || '').toLowerCase();
    if (lower.includes('/login')) return 'login';
    if (lower.includes('/logout')) return 'logout';
    if (lower.includes('/imports') || lower.includes('/import')) return 'import';
    if (lower.includes('/create-request')) return 'create_request';
    if (lower.includes('/update-request')) return 'update_request';
    if (lower.includes('/approve')) return 'approve';
    if (lower.includes('/reject')) return 'reject';
    if (lower.includes('/create')) return 'create';
    if (lower.includes('/update')) return 'update';
    if (lower.includes('/delete')) return 'delete';
    if (method === 'POST') return 'create';
    if (method === 'PUT' || method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return String(method || 'unknown').toLowerCase();
};

const resolveSource = (pathName) => {
    const p = String(pathName || '');
    if (p.startsWith('/api/mobile')) return 'mobile';
    if (p.includes('webhook') || p.includes('Webhook')) return 'webhook';
    return 'admin';
};

const shouldSkip = (req) => {
    const method = String(req.method || '').toUpperCase();
    if (!MUTATING_METHODS.has(method)) return true;
    const pathName = String(req.originalUrl || req.url || '').split('?')[0];
    if (!pathName.startsWith('/api')) return true;
    return SKIP_PATH_PREFIXES.some(
        (prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`)
    );
};

const extractReferenceId = (req, body) => {
    const candidates = [
        req.params?.id,
        req.params?.franchise_id,
        req.params?.order_id,
        req.params?.quote_id,
        body?._id,
        body?.id,
        body?.record?._id,
        body?.data?._id,
        body?.order?._id,
        body?.quote?._id,
    ];
    for (const c of candidates) {
        if (c === undefined || c === null) continue;
        const s = typeof c === 'object' && c._id ? String(c._id) : String(c);
        if (/^[a-fA-F0-9]{24}$/.test(s)) return s;
    }
    return null;
};

const redactValue = (key, value) => {
    if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return '[REDACTED]';
    if (Array.isArray(value)) {
        if (value.length > 20) return `[array:${value.length}]`;
        return value.map((item, i) =>
            item && typeof item === 'object' ? redactObject(item) : item
        );
    }
    if (value && typeof value === 'object') return redactObject(value);
    return value;
};

const redactObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const out = {};
    const keys = Object.keys(obj).slice(0, 40);
    for (const key of keys) {
        out[key] = redactValue(key, obj[key]);
    }
    if (Object.keys(obj).length > 40) out._truncated = true;
    return out;
};

const buildDescription = (req, statusCode, responseBody) => {
    const method = String(req.method || '').toUpperCase();
    const pathName = String(req.originalUrl || req.url || '').split('?')[0];
    const message =
        responseBody && typeof responseBody === 'object'
            ? responseBody.message || null
            : null;
    const parts = [`${method} ${pathName}`];
    if (message) parts.push(String(message));
    if (statusCode >= 400 && responseBody && typeof responseBody === 'object') {
        const err =
            responseBody.error ||
            responseBody.message ||
            `HTTP ${statusCode}`;
        parts.push(`Error: ${err}`);
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        try {
            parts.push(`Payload: ${JSON.stringify(redactObject(req.body))}`);
        } catch (_) {
            /* ignore */
        }
    }
    return parts.join(' | ').slice(0, 2000);
};

const auditLogMiddleware = (req, res, next) => {
    if (shouldSkip(req)) return next();

    const startedPath = String(req.originalUrl || req.url || '');
    const originalJson = res.json.bind(res);

    res.json = function auditAwareJson(body) {
        try {
            const statusCode = res.statusCode || 200;
            const pathName = startedPath.split('?')[0];
            const referenceId = extractReferenceId(req, body);
            const franchiseFromBody =
                body?.record?.franchise_id ||
                body?.franchise_id ||
                body?.franchise?._id ||
                req.body?.franchise_id ||
                null;

            setImmediate(() => {
                writeAuditLog({
                    module: resolveModule(pathName),
                    action: resolveAction(req.method, pathName),
                    reference: referenceId,
                    reference_type: resolveModule(pathName),
                    reference_id: referenceId,
                    description: buildDescription(req, statusCode, body),
                    performed_by: req.user?.id || req.user?._id || null,
                    franchise_id: franchiseFromBody || req.user?.franchise_id || null,
                    status: statusCode >= 400 ? 'failed' : 'success',
                    source: resolveSource(pathName),
                    method: req.method,
                    path: pathName,
                    http_status: statusCode,
                    ip: req.ip || req.headers['x-forwarded-for'] || null,
                    error_message:
                        statusCode >= 400 && body && typeof body === 'object'
                            ? body.message || body.error || null
                            : null,
                });
            });
        } catch (err) {
            console.error('auditLogMiddleware', err.message);
        }
        return originalJson(body);
    };

    next();
};

module.exports = auditLogMiddleware;
