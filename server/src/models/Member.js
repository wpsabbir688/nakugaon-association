import mongoose from 'mongoose';

// Public member directory: ONLY approved public fields are exposed by the
// public routes. Phone, address, father's name, and notes are private.
const memberSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true, unique: true, index: true }, // NAK-0001
    businessName: { type: String, required: true, trim: true, maxlength: 200 },
    ownerName: { type: String, required: true, trim: true, maxlength: 120 },
    fatherName: { type: String, trim: true, maxlength: 120, default: '' },
    profileImageUrl: { type: String, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    joiningDate: { type: Date, required: true },
    status: { type: String, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE', index: true },
    registrationInfo: { type: String, trim: true, maxlength: 500, default: '' },
    notes: { type: String, maxlength: 2000, default: '' }, // private staff notes
    openingBalance: { type: Number, default: 0, validate: Number.isInteger },
    // Transactionally maintained cache of the ledger-derived balance.
    // The ledger itself is the source of truth; /admin/reconcile recomputes it.
    outstandingBalance: { type: Number, default: 0, validate: Number.isInteger },
    isDemo: { type: Boolean, default: false },
  },
  { timestamps: true }
);
memberSchema.index({ businessName: 'text', ownerName: 'text', memberId: 'text' });

export const Member = mongoose.model('Member', memberSchema);
