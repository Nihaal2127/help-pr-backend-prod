const mongoose = require('mongoose');

const partnerSubcategorySchema = new mongoose.Schema(
  {
    partner_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: 'user',
      required: true,
    },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: 'category',
      required: true,
    },
    subcategory_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: 'subcategory',
      required: true,
    },
    services: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'service' }],
      default: [],
    },
    /** Local partner offering preference (is_enabled); effective visibility is resolver-computed. */
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  { timestamps: false }
);

partnerSubcategorySchema.index(
  { partner_id: 1, subcategory_id: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);
partnerSubcategorySchema.index({ partner_id: 1, deleted_at: 1 });
partnerSubcategorySchema.index({ partner_id: 1, category_id: 1, deleted_at: 1 });

module.exports = mongoose.model('partner_subcategory', partnerSubcategorySchema);
