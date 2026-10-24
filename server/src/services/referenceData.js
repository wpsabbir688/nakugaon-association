import { prisma } from '../config/db.js';
import { DEFAULT_FEES } from '../constants.js';

// Seed reference data: fee rules + chart of accounts. Idempotent.
export async function ensureReferenceData() {
  const fees = [
    { key: 'VEHICLE_PER_UNIT', label: 'Vehicle entry (per vehicle)', category: 'VEHICLE', amount: DEFAULT_FEES.VEHICLE_PER_UNIT },
    { key: 'WB_BHUTAN', label: 'Bhutan vehicle', category: 'WEIGHBRIDGE', amount: DEFAULT_FEES.WB_BHUTAN },
    { key: 'WB_BD', label: 'Bangladeshi vehicle', category: 'WEIGHBRIDGE', amount: DEFAULT_FEES.WB_BD },
    { key: 'WB_LORRY', label: 'Lorry/crab vehicle', category: 'WEIGHBRIDGE', amount: DEFAULT_FEES.WB_LORRY },
    { key: 'WB_TROLLEY', label: 'Trolley', category: 'WEIGHBRIDGE', amount: DEFAULT_FEES.WB_TROLLEY },
  ];
  for (const f of fees) {
    await prisma.feeRule.upsert({ where: { key: f.key }, update: {}, create: f });
  }
  const accounts = [
    { code: 'RECEIVABLE', name: 'Member Receivables', type: 'ASSET' },
    { code: 'VEHICLE_INCOME', name: 'Vehicle Fee Income', type: 'INCOME' },
    { code: 'WEIGHBRIDGE_INCOME', name: 'Weighbridge Fee Income', type: 'INCOME' },
    { code: 'OTHER_INCOME', name: 'Other Income', type: 'INCOME' },
    { code: 'CASH', name: 'Cash', type: 'ASSET' },
    { code: 'BANK', name: 'Bank', type: 'ASSET' },
    { code: 'EXPENSE', name: 'General Expenses', type: 'EXPENSE' },
  ];
  for (const a of accounts) {
    await prisma.account.upsert({ where: { code: a.code }, update: {}, create: a });
  }
}
