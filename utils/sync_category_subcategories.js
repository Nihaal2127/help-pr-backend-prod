const Category = require('../models/category');
const Subcategory = require('../models/subcategory');

/**
 * Rebuild category.subcategories[] from the subcategory collection
 * (embedded snapshot: _id, subcategory_id, name, services).
 */
const syncCategoryEmbeddedSubcategories = async (categoryId) => {
  if (!categoryId) return;

  const rows = await Subcategory.find({
    category_id: categoryId,
    deleted_at: null,
    is_request: false,
  })
    .select('_id subcategory_id name services')
    .lean();

  const embedded = rows.map((row) => ({
    _id: row._id,
    subcategory_id: row.subcategory_id || '',
    name: row.name || '',
    services: Array.isArray(row.services) ? row.services : [],
  }));

  await Category.updateOne(
    { _id: categoryId },
    { $set: { subcategories: embedded, updated_at: new Date() } }
  );
};

module.exports = { syncCategoryEmbeddedSubcategories };
