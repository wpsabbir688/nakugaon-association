import mongoose from 'mongoose';

// One ledger row per financial event. The member balance is derived as:
// openingBalance + SUM(charges) - SUM(payments) - SUM(credits) (+/- reversals).
const ledgerEntrySchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    kind: {
      type: String,
      enum: ['OPENING', 'VEHICLE_CHARGE', 'WEIGHBRIDGE_CHARGE', 'OTHER_CHARGE', 'PAYMENT', 'CREDIT', 'REVERSAL'],
      required: true,
    },
    // Signed effect on the outstanding balance: charges +, payments/credits -.
    amount: { type: Number, required: true, validate: Number.isInteger },
    runningBalance: { type: Number, required: true, validate: Number.isInteger },
    reference: { type: String, default: '' },
    referenceType: { type: String, default: '' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
    reversalReason: { type: String, default: '' },
    idempotencyKey: { type: String, default: null, index: true },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    occurredAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);
ledgerEntrySchema.index({ member: 1, occurredAt: -1 });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);
