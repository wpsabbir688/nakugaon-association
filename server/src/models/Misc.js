import mongoose from 'mongoose';

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true },
    language: { type: String, enum: ['bn', 'en', 'both'], default: 'both' },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Configurable site information. Official contact details, registration
// numbers, and statistics are NEVER invented — these stay empty until the
// association fills them in from its own records (see README).
const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: 'system' },
    action: { type: String, required: true, index: true },
    entity: { type: String, default: '' },
    entityId: { type: String, default: '' },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);
auditLogSchema.index({ createdAt: -1 });

export const Notice = mongoose.model('Notice', noticeSchema);
export const SiteSetting = mongoose.model('SiteSetting', siteSettingSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
