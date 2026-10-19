/**
 * Inserts Subcategory folder into Help-PR-All-APIs after Category (catalog).
 * Run: node postman/patch-subcategory-into-all-apis.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL_APIS = path.join(__dirname, 'Help-PR-All-APIs.postman_collection.json');
const SUB_FILE = path.join(__dirname, 'Help-PR-Subcategory-APIs.postman_collection.json');

const all = JSON.parse(fs.readFileSync(ALL_APIS, 'utf8'));
const sub = JSON.parse(fs.readFileSync(SUB_FILE, 'utf8'));

const FOLDER_NAME = '10b — Subcategory (catalog)';

const existingIdx = all.item.findIndex((f) => f.name === FOLDER_NAME);
if (existingIdx >= 0) {
  all.item.splice(existingIdx, 1);
}

const subcategoryFolder = {
  name: FOLDER_NAME,
  description:
    '**/api/subcategory** — Category → Subcategory → Services. Same request/approve pattern as category & service. Also available as standalone import: `Help-PR-Subcategory-APIs.postman_collection.json`.',
  item: sub.item,
};

const categoryIdx = all.item.findIndex((f) =>
  String(f.name || '').includes('Category (catalog)')
);
const insertAt = categoryIdx >= 0 ? categoryIdx + 1 : all.item.length;
all.item.splice(insertAt, 0, subcategoryFolder);

const varsToAdd = [
  { key: 'subcategoryId', value: '' },
  { key: 'subcategoryRequestId', value: '' },
  { key: 'categoryId', value: '' },
];
if (!Array.isArray(all.variable)) all.variable = [];
for (const v of varsToAdd) {
  if (!all.variable.some((x) => x.key === v.key)) {
    all.variable.push(v);
  }
}

if (all.info) {
  const stamp = new Date().toISOString().slice(0, 10);
  all.info.description = String(all.info.description || '').replace(
    /\n\n\*+\s*Subcategory patch.*/s,
    ''
  );
  all.info.description += `\n\n*** Subcategory patch ${stamp}: added folder **${FOLDER_NAME}** (\`/api/subcategory\`). ***`;
}

fs.writeFileSync(ALL_APIS, JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`Inserted "${FOLDER_NAME}" at index ${insertAt} into ${path.basename(ALL_APIS)}`);
console.log(`Standalone collection: ${path.basename(SUB_FILE)}`);
