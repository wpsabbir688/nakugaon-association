import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    paidAt: { type: Date, required: true, index: true },
    method: { type: String, enum: ['CASH', 'BANK', 'OTHER'], required: true },
    receiptNumber: { type: String, required: true, unique: true, index: true },
    reference: { type: String, trim: true, default: '' },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['POSTED', 'REVERSED'], default: 'POSTED' },
    idempotencyKey: { type: String, default: null, unique: true, sparse: true },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

// Payment allocation policy (documented in README): a payment is applied to
// the oldest outstanding charges first (FIFO). Allocations are informational
// records; the ledger entry is the authoritative financial record.
const paymentAllocationSchema = new mongoose.Schema(
  {
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', required: true },
    amount: { type: Number, required: true, validate: Number.isInteger },
  },
  { timestamps: true }
);

const expenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    amount: { type: Number, required: true, min: 1, validate: Number.isInteger },
    spentAt: { type: Date, required: true, index: true },
    method: { type: String, enum: ['CASH', 'BANK', 'OTHER'], default: 'CASH' },
    category: { type: String, trim: true, default: '' },
    notes: { type: String, maxlength: 1000, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const Payment = mongoose.model('Payment', paymentSchema);
export const PaymentAllocation = mongoose.model('PaymentAllocation', paymentAllocationSchema);
export const Expense = mongoose.model('Expense', expenseSchema);
