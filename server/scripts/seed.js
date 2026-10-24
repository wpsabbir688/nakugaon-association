// Demo seed — FICTIONAL data only, for local development and demos.
// NEVER run against a production database holding real member records.
// Run: SEED_DEMO=true node scripts/seed.js
import bcrypt from 'bcrypt';
import { prisma, disconnectDb } from '../src/config/db.js';
import { ensureReferenceData } from '../src/services/referenceData.js';
import { nextSeq } from '../src/constants.js';
import { DEFAULT_FEES } from '../src/constants.js';
import { postCharge, postPayment } from '../src/services/ledgerService.js';

if (process.env.SEED_DEMO !== 'true') {
  console.error('Refusing to seed: set SEED_DEMO=true to confirm this is a demo database.');
  process.exit(1);
}

const DEMO_MEMBERS = [
  { businessName: 'Padma Traders (Demo)', ownerName: 'Abdul Karim', phone: '01700000001', address: 'Nakugaon Land Port Road (Demo)' },
  { businessName: 'Meghna Enterprise (Demo)', ownerName: 'Farhana Akter', phone: '01700000002', address: 'Nakugaon Bazar (Demo)' },
  { businessName: 'Teesta Transport (Demo)', ownerName: 'Rahim Uddin', phone: '01700000003', address: 'Sherpur Road (Demo)' },
  { businessName: 'Surma Import House (Demo)', ownerName: 'Nasrin Sultana', phone: '01700000004', address: 'Nakugaon (Demo)' },
  { businessName: 'Karnaphuli Traders (Demo)', ownerName: 'Mohammad Ali', phone: '01700000005', address: 'Port Area (Demo)' },
  { businessName: 'Brahmaputra Enterprise (Demo)', ownerName: 'Shirin Akter', phone: '01700000006', address: 'Nakugaon (Demo)' },
];

async function main() {
  await prisma.$connect();
  await ensureReferenceData();
  await prisma.$transaction(async (tx) => {
    for (const d of DEMO_MEMBERS) {
      const seq = await nextSeq(tx, 'member');
      const memberId = `NAK-${String(seq).padStart(4, '0')}`;
      const member = await tx.member.create({
        data: {
          memberId, businessName: d.businessName, ownerName: d.ownerName, phone: d.phone,
          address: d.address, joiningDate: new Date('2024-01-15'), openingBalance: 0,
          outstandingBalance: 0, isDemo: true,
        },
      });
      // A few demo charges + one partial payment per member, through the real ledger.
      await postCharge({ memberId: member.id, kind: 'VEHICLE_CHARGE', amount: 4 * DEFAULT_FEES.VEHICLE_PER_UNIT, reference: 'DEMO-VEH', referenceType: 'VehicleEntry', incomeAccount: 'VEHICLE_INCOME', occurredAt: new Date(), tx });
      await postCharge({ memberId: member.id, kind: 'WEIGHBRIDGE_CHARGE', amount: DEFAULT_FEES.WB_BD, reference: 'DEMO-WB', referenceType: 'WeighbridgeEntry', incomeAccount: 'WEIGHBRIDGE_INCOME', occurredAt: new Date(), tx });
      await postPayment({ memberId: member.id, amount: 100, reference: 'DEMO-PAY', referenceType: 'Payment', method: 'CASH', occurredAt: new Date(), tx });
    }
  });
  // Demo super admin — DEMO ONLY. Real admins must use scripts/create-admin.js.
  const existing = await prisma.user.findUnique({ where: { email: 'admin@nakugaon.local' } });
  if (!existing) {
    await prisma.user.create({ data: { name: 'Demo Admin', email: 'admin@nakugaon.local', passwordHash: await bcrypt.hash('Nakugaon@123', 12), role: 'SUPER_ADMIN' } });
  }
  console.log('Demo seed complete: 6 fictional demo members, demo charges/payments, demo admin admin@nakugaon.local (DEMO ONLY).');
  await disconnectDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
