const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  {
    subcategory_id: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    desc: { type: String, required: true, trim: true },
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: "category",
      required: true,
    },
    services: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "service",
        },
      ],
      default: [],
    },
    image_url: { type: String, required: true, trim: true },
    is_active: { type: Boolean, default: true },
    is_request: { type: Boolean, default: false },
    approval_status: {
      type: String,
      enum: ["approve", "pending", "rejected"],
      default: "pending",
    },
    rejection_reason: { type: String, default: null },
    requested_by: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      ref: "user",
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    deleted_at: { type: Date, default: null },
  },
  {
    timestamps: false,
  }
);

subcategorySchema.index({ name: 1 });
subcategorySchema.index({ category_id: 1 });
subcategorySchema.index({ is_active: 1 });
subcategorySchema.index({ subcategory_id: 1 });
subcategorySchema.index({ services: 1 });
subcategorySchema.index({ is_request: 1 });
subcategorySchema.index({ requested_by: 1 });

module.exports = mongoose.model("subcategory", subcategorySchema);
