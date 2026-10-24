import mongoose from 'mongoose';

const vehicleEntrySchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    entryDate: { type: Date, required: true, index: true },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    feePerVehicle: { type: Number, required: true, validate: Number.isInteger }, // snapshot
    total: { type: Number, required: true, validate: Number.isInteger },
    notes: { type: String, maxlength: 1000, default: '' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, default: null, unique: true, sparse: true },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

const weighbridgeEntrySchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    occurredAt: { type: Date, required: true, index: true },
    category: { type: String, enum: ['WB_BHUTAN', 'WB_BD', 'WB_LORRY', 'WB_TROLLEY'], required: true },
    fee: { type: Number, required: true, validate: Number.isInteger }, // snapshot
    weightKg: { type: Number, default: null },
    referenceNumber: { type: String, trim: true, default: '' },
    operator: { type: String, trim: true, default: '' },
    notes: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['POSTED', 'VOIDED'], default: 'POSTED' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    idempotencyKey: { type: String, default: null, unique: true, sparse: true },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry', default: null },
  },
  { timestamps: true }
);

export const VehicleEntry = mongoose.model('VehicleEntry', vehicleEntrySchema);
export const WeighbridgeEntry = mongoose.model('WeighbridgeEntry', weighbridgeEntrySchema);
