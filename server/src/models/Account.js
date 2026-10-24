import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // RECEIVABLE, VEHICLE_INCOME, ...
    name: { type: String, required: true },
    type: { type: String, enum: ['ASSET', 'INCOME', 'EXPENSE', 'LIABILITY'], required: true },
  },
  { timestamps: true }
);
export const Account = mongoose.model('Account', accountSchema);

// Double-entry journal: every entry's lines MUST balance (debits == credits).
const journalLineSchema = new mongoose.Schema(
  {
    accountCode: { type: String, required: true },
    debit: { type: Number, default: 0, validate: Number.isInteger },
    credit: { type: Number, default: 0, validate: Number.isInteger },
  },
  { _id: false }
);
const journalEntrySchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    lines: { type: [journalLineSchema], required: true, validate: (v) => v.length >= 2 },
    referenceType: { type: String, default: '' },
    referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
export const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
