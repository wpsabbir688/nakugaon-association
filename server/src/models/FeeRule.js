import mongoose from 'mongoose';

// Editable fee configuration. Changing a rule NEVER rewrites history:
// every charge stores a snapshot of the fee that applied at creation time.
const feeRuleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true }, // VEHICLE_PER_UNIT, WB_BHUTAN, WB_BD, WB_LORRY, WB_TROLLEY
    label: { type: String, required: true },
    category: { type: String, enum: ['VEHICLE', 'WEIGHBRIDGE'], required: true },
    amount: { type: Number, required: true, validate: Number.isInteger },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const FeeRule = mongoose.model('FeeRule', feeRuleSchema);

export const WEIGHBRIDGE_CATEGORIES = [
  { key: 'WB_BHUTAN', label: 'Bhutan vehicle' },
  { key: 'WB_BD', label: 'Bangladeshi vehicle' },
  { key: 'WB_LORRY', label: 'Lorry/crab vehicle' },
  { key: 'WB_TROLLEY', label: 'Trolley' },
];

export const DEFAULT_FEES = {
  VEHICLE_PER_UNIT: 50,
  WB_BHUTAN: 100,
  WB_BD: 200,
  WB_LORRY: 100,
  WB_TROLLEY: 300,
};
