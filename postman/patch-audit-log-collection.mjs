import fs from 'fs';

const path = new URL('./Help-PR-All-APIs.postman_collection.json', import.meta.url);
const c = JSON.parse(fs.readFileSync(path, 'utf8'));

const authHeader = [
  { key: 'Authorization', value: 'Bearer {{accessToken}}', type: 'text' },
  { key: 'Accept', value: 'application/json' },
];

const successExample = {
  name: '200 — list with records',
  originalRequest: {
    method: 'GET',
    header: authHeader,
    url: {
      raw: '{{baseUrl}}/api/audit-log/getAll?page=1&limit=10&from_date=2026-10-01&to_date=2026-10-30&search=franchise',
      host: ['{{baseUrl}}'],
      path: ['api', 'audit-log', 'getAll'],
      query: [
        { key: 'page', value: '1' },
        { key: 'limit', value: '10' },
        { key: 'from_date', value: '2026-10-01' },
        { key: 'to_date', value: '2026-10-30' },
        { key: 'search', value: 'franchise' },
      ],
    },
  },
  status: 'OK',
  code: 200,
  _postman_previewlanguage: 'json',
  header: [{ key: 'Content-Type', value: 'application/json' }],
  body: JSON.stringify(
    {
      success: true,
      status: 200,
      message: 'Audit log list fetched successfully.',
      totalItems: 2,
      totalPages: 1,
      currentPage: 1,
      records: [
        {
          s_no: 1,
          _id: '671234abcd5678ef90123456',
          created_at: '2026-10-30T08:42:11.234Z',
          module: 'Franchise Management',
          action: 'update',
          reference: '6a71aa6df7a0024b52cf551b',
          reference_type: 'Franchise Management',
          reference_id: '6a71aa6df7a0024b52cf551b',
          description:
            'PUT /api/franchise/update/6a71aa6df7a0024b52cf551b | Franchise updated successfully',
          performed_by: '64f1a2b3c4d5e6f708901234',
          performed_by_name: 'Nihaal FA',
          franchise_id: '6a71aa6df7a0024b52cf551b',
          franchise_name: 'TG Franchise',
          status: 'success',
          source: 'admin',
          method: 'PUT',
          path: '/api/franchise/update/6a71aa6df7a0024b52cf551b',
          http_status: 200,
          ip: '203.0.113.10',
          error_message: null,
        },
        {
          s_no: 2,
          _id: '671234abcd5678ef90123457',
          created_at: '2026-10-30T07:15:02.100Z',
          module: 'Order Management',
          action: 'create',
          reference: '671111aaaabbbbccccddddee',
          reference_type: 'Order Management',
          reference_id: '671111aaaabbbbccccddddee',
          description: 'POST /api/order/create | Order created successfully',
          performed_by: '64f1a2b3c4d5e6f708901234',
          performed_by_name: 'Nihaal FA',
          franchise_id: '6a71aa6df7a0024b52cf551b',
          franchise_name: 'TG Franchise',
          status: 'success',
          source: 'admin',
          method: 'POST',
          path: '/api/order/create',
          http_status: 200,
          ip: '203.0.113.10',
          error_message: null,
        },
      ],
    },
    null,
    2
  ),
};

const emptyExample = {
  name: '200 — empty',
  status: 'OK',
  code: 200,
  _postman_previewlanguage: 'json',
  header: [{ key: 'Content-Type', value: 'application/json' }],
  body: JSON.stringify(
    {
      success: true,
      status: 200,
      message: 'Audit log list fetched successfully.',
      totalItems: 0,
      totalPages: 1,
      currentPage: 1,
      records: [],
    },
    null,
    2
  ),
};

const forbiddenExample = {
  name: '403 — not Super Admin/Staff',
  status: 'Forbidden',
  code: 403,
  _postman_previewlanguage: 'json',
  header: [{ key: 'Content-Type', value: 'application/json' }],
  body: JSON.stringify(
    {
      success: false,
      status: 403,
      message: 'Super admin or staff access required.',
    },
    null,
    2
  ),
};

const auditFolder = {
  name: '46 — Audit log',
  description:
    '**/api/audit-log** — Append-only audit trail for mutating admin/mobile API calls (POST/PUT/PATCH/DELETE).\n\n**Access:** Super Admin (5) & Staff (6) only.\n\n**Auth:** `Bearer {{accessToken}}` — run **00 — Auth → Admin / Staff → Login** first.\n\n**UI columns:** Create Date (`created_at`), Module, Action, Reference, Description, Performed By (`performed_by_name`), Franchise (`franchise_name`), Status.\n\n**Notes:** Rows are written automatically by `auditLogMiddleware`. GET list does not create audit rows. OTP/dashboard/export/audit-log itself are skipped.',
  item: [
    {
      name: '1. Audit log — getAll',
      request: {
        method: 'GET',
        header: authHeader,
        url: {
          raw: '{{baseUrl}}/api/audit-log/getAll?page=1&limit=10&from_date={{auditFromDate}}&to_date={{auditToDate}}&search={{auditSearch}}',
          host: ['{{baseUrl}}'],
          path: ['api', 'audit-log', 'getAll'],
          query: [
            { key: 'page', value: '1', description: 'default 1' },
            { key: 'limit', value: '10', description: 'default 10, max 100' },
            {
              key: 'from_date',
              value: '{{auditFromDate}}',
              description: 'Optional. Aliases: fromDate, from',
            },
            {
              key: 'to_date',
              value: '{{auditToDate}}',
              description: 'Optional. Aliases: toDate, to. Date-only includes end of day.',
            },
            {
              key: 'search',
              value: '{{auditSearch}}',
              description:
                'Optional. Searches module, action, reference, description, performed_by_name, franchise_name. Aliases: q, keyword',
            },
            {
              key: 'module',
              value: 'Franchise Management',
              disabled: true,
              description: 'Exact module label filter',
            },
            {
              key: 'action',
              value: 'update',
              disabled: true,
              description: 'Exact action filter (create|update|delete|login|...)',
            },
            {
              key: 'status',
              value: 'success',
              disabled: true,
              description: 'success | failed',
            },
            {
              key: 'franchise_id',
              value: '{{franchiseId}}',
              disabled: true,
              description: 'Filter by franchise ObjectId',
            },
            {
              key: 'performed_by',
              value: '',
              disabled: true,
              description: 'Filter by user ObjectId',
            },
          ],
        },
        description:
          '**GET /api/audit-log/getAll**\n\nPaginated audit logs for the Admin **Audit Logs** screen.\n\n**200 fields per record:** `s_no`, `created_at`, `module`, `action`, `reference`, `description`, `performed_by` / `performed_by_name`, `franchise_id` / `franchise_name`, `status`, plus `source`, `method`, `path`, `http_status`, `ip`, `error_message`.',
      },
      response: [successExample, emptyExample, forbiddenExample],
      description: 'List audit logs with date range + search (matches Admin Audit Logs filters).',
    },
    {
      name: '2. Audit log — getAll (failed only)',
      request: {
        method: 'GET',
        header: authHeader,
        url: {
          raw: '{{baseUrl}}/api/audit-log/getAll?page=1&limit=20&status=failed',
          host: ['{{baseUrl}}'],
          path: ['api', 'audit-log', 'getAll'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' },
            { key: 'status', value: 'failed' },
          ],
        },
        description: '**GET /api/audit-log/getAll?status=failed** — failed mutating API calls only.',
      },
      response: [],
    },
    {
      name: '3. Audit log — getAll (by franchise)',
      request: {
        method: 'GET',
        header: authHeader,
        url: {
          raw: '{{baseUrl}}/api/audit-log/getAll?page=1&limit=20&franchise_id={{franchiseId}}',
          host: ['{{baseUrl}}'],
          path: ['api', 'audit-log', 'getAll'],
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '20' },
            {
              key: 'franchise_id',
              value: '{{franchiseId}}',
              description: 'Set from Franchise APIs',
            },
          ],
        },
        description:
          '**GET /api/audit-log/getAll?franchise_id=** — logs for one franchise. Set `{{franchiseId}}` first.',
      },
      response: [],
    },
  ],
};

const existingIdx = c.item.findIndex((x) => x.name === '46 — Audit log');
if (existingIdx >= 0) {
  c.item[existingIdx] = auditFolder;
} else {
  const mobileIdx = c.item.findIndex((x) => x.name === 'Mobile');
  if (mobileIdx >= 0) c.item.splice(mobileIdx, 0, auditFolder);
  else c.item.push(auditFolder);
}

const patchNote =
  '\n\n*** Audit log patch 2026-10-30: folder **46 — Audit log** (`GET /api/audit-log/getAll`) — Super Admin/Staff. Auto-written by mutating /api middleware. ***';
if (!String(c.info.description || '').includes('Audit log patch 2026-10-30')) {
  c.info.description = String(c.info.description || '') + patchNote;
}

const varKeys = new Set((c.variable || []).map((v) => v.key));
const addVar = (key, value, description) => {
  if (varKeys.has(key)) return;
  c.variable.push({ key, value, type: 'string', description });
  varKeys.add(key);
};
addVar('auditFromDate', '2026-10-01', 'Audit Logs From Date filter');
addVar('auditToDate', '2026-10-30', 'Audit Logs To Date filter');
addVar(
  'auditSearch',
  '',
  'Audit Logs search (module, reference, action, user, franchise name)'
);

fs.writeFileSync(path, `${JSON.stringify(c, null, 2)}\n`);
console.log('Updated Help-PR-All-APIs.postman_collection.json');
console.log(
  c.item
    .filter((x) => x.name.includes('Audit') || x.name === 'Mobile' || x.name.startsWith('45'))
    .map((x) => x.name)
    .join('\n')
);
