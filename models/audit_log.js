const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
    {
        module: { type: String, required: true, trim: true, index: true },
        action: { type: String, required: true, trim: true, index: true },
        reference: { type: String, default: null, trim: true, index: true },
        reference_type: { type: String, default: null, trim: true },
        reference_id: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        description: { type: String, default: '', trim: true },
        performed_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
            default: null,
            index: true,
        },
        performed_by_name: { type: String, default: null, trim: true },
        franchise_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'franchise',
            default: null,
            index: true,
        },
        franchise_name: { type: String, default: null, trim: true },
        status: {
            type: String,
            enum: ['success', 'failed'],
            default: 'success',
            index: true,
        },
        source: {
            type: String,
            enum: ['admin', 'mobile', 'webhook', 'system', 'unknown'],
            default: 'unknown',
        },
        method: { type: String, default: null, trim: true },
        path: { type: String, default: null, trim: true },
        http_status: { type: Number, default: null },
        ip: { type: String, default: null, trim: true },
        error_message: { type: String, default: null, trim: true },
        created_at: { type: Date, default: Date.now, index: true },
    },
    {
        timestamps: false,
    }
);

auditLogSchema.index({ created_at: -1 });
auditLogSchema.index({ module: 1, created_at: -1 });
auditLogSchema.index({ franchise_id: 1, created_at: -1 });

module.exports = mongoose.model('audit_log', auditLogSchema);
