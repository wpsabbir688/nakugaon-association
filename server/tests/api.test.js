import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

// The test database URL must be set BEFORE the app (and its Prisma client)
// is imported, because Prisma reads DATABASE_URL at construction time.
// Default: local VM Postgres over the Unix socket as the OS user (peer auth).
// Override with TEST_DATABASE_URL on any other machine.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://root@localhost:5432/nakugaon_test?host=/var/run/postgresql';

const { createApp } = await import('../src/app.js');
const { prisma, disconnectDb } = await import('../src/config/db.js');
const { ensureReferenceData } = await import('../src/services/referenceData.js');

const app = createApp();
let adminToken, operatorToken, accountantToken, memberUserToken, memberId, memberDbId;

async function login(email, password) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function resetDb() {
  // Truncate every table (FK-safe via CASCADE) and reset the app state.
  const tables = [
    'PaymentAllocation', 'VehicleEntry', 'WeighbridgeEntry', 'Payment',
    'LedgerEntry', 'JournalEntry', 'Expense', 'Notice', 'AuditLog',
    'SiteSetting', 'FeeRule', 'Account', 'Counter', 'User', 'Member',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

beforeAll(async () => {
  await resetDb();
  await ensureReferenceData();
  const hash = await bcrypt.hash('Password@123', 12);
  await prisma.user.createMany({
    data: [
      { name: 'Admin', email: 'admin@test.local', passwordHash: hash, role: 'SUPER_ADMIN' },
      { name: 'Operator', email: 'op@test.local', passwordHash: hash, role: 'OPERATOR' },
      { name: 'Accountant', email: 'acc@test.local', passwordHash: hash, role: 'ACCOUNTANT' },
    ],
  });
  adminToken = await login('admin@test.local', 'Password@123');
  operatorToken = await login('op@test.local', 'Password@123');
  accountantToken = await login('acc@test.local', 'Password@123');
  const m = await request(app).post('/api/v1/members').set('Authorization', `Bearer ${adminToken}`).send({
    businessName: 'Test Traders', ownerName: 'Test Owner', phone: '01700000000', joiningDate: '2024-01-01',
  });
  expect(m.status).toBe(201);
  memberId = m.body.member.memberId;
  memberDbId = m.body.member._id;
  await prisma.user.create({ data: { name: 'Member User', email: 'member@test.local', passwordHash: hash, role: 'MEMBER', memberId: memberDbId } });
  memberUserToken = await login('member@test.local', 'Password@123');
});

afterAll(async () => {
  await disconnectDb();
});

describe('members', () => {
  it('generates sequential unique member IDs (NAK-0001, NAK-0002)', async () => {
    expect(memberId).toBe('NAK-0001');
    const m2 = await request(app).post('/api/v1/members').set('Authorization', `Bearer ${adminToken}`).send({
      businessName: 'Second Traders', ownerName: 'Second Owner', joiningDate: '2024-01-02',
    });
    expect(m2.body.member.memberId).toBe('NAK-0002');
  });
  it('rejects unauthenticated access and wrong roles', async () => {
    const noAuth = await request(app).get('/api/v1/members');
    expect(noAuth.status).toBe(401);
    const opCreate = await request(app).post('/api/v1/members').set('Authorization', `Bearer ${operatorToken}`).send({
      businessName: 'X', ownerName: 'Y', joiningDate: '2024-01-01',
    });
    expect(opCreate.status).toBe(403);
  });
});

describe('vehicle entries', () => {
  it('calculates quantity x 50 and posts exactly one ledger charge', async () => {
    const res = await request(app).post('/api/v1/vehicles').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId, entryDate: '2026-10-24', quantity: 4, idempotencyKey: 'veh-test-1',
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.total).toBe(200);
    expect(res.body.entry.feePerVehicle).toBe(50);
    const ledger = await prisma.ledgerEntry.findMany({ where: { memberId: memberDbId, kind: 'VEHICLE_CHARGE' } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(200);
  });
  it('rejects quantity 0 and prevents duplicate idempotent submissions', async () => {
    const bad = await request(app).post('/api/v1/vehicles').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId, entryDate: '2026-10-24', quantity: 0,
    });
    expect(bad.status).toBe(400);
    const dup = await request(app).post('/api/v1/vehicles').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId, entryDate: '2026-10-24', quantity: 4, idempotencyKey: 'veh-test-1',
    });
    expect(dup.body.duplicate).toBe(true);
    const ledger = await prisma.ledgerEntry.findMany({ where: { memberId: memberDbId, kind: 'VEHICLE_CHARGE' } });
    expect(ledger).toHaveLength(1);
  });
});

describe('weighbridge', () => {
  it.each([
    ['WB_BHUTAN', 100], ['WB_BD', 200], ['WB_LORRY', 100], ['WB_TROLLEY', 300],
  ])('charges %s at %s taka', async (category, fee) => {
    const res = await request(app).post('/api/v1/weighbridge').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId, occurredAt: '2026-10-24T10:00:00.000Z', category, idempotencyKey: `wb-${category}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.fee).toBe(fee);
  });
  it('preserves historical fees after a rule change', async () => {
    await prisma.feeRule.update({ where: { key: 'WB_BD' }, data: { amount: 250 } });
    const old = await prisma.weighbridgeEntry.findFirst({ where: { category: 'WB_BD' } });
    expect(old.fee).toBe(200);
    await prisma.feeRule.update({ where: { key: 'WB_BD' }, data: { amount: 200 } });
  });
});

describe('payments and balances', () => {
  it('computes outstanding = charges - payments, supports partial payment', async () => {
    // Charges so far: 200 (vehicle) + 100+200+100+300 (weighbridge) = 900
    const before = await request(app).get(`/api/v1/members/${memberId}/balance`).set('Authorization', `Bearer ${accountantToken}`);
    expect(before.body.computedBalance).toBe(900);
    const pay = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${accountantToken}`).send({
      memberId, amount: 350, paidAt: '2026-10-24', method: 'CASH', idempotencyKey: 'pay-test-1',
    });
    expect(pay.status).toBe(201);
    expect(pay.body.previousBalance).toBe(900);
    expect(pay.body.remainingBalance).toBe(550);
    expect(pay.body.payment.receiptNumber).toMatch(/^REC-\d{8}-\d{4}$/);
  });
  it('prevents duplicate payments and handles overpayment as credit', async () => {
    const dup = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${accountantToken}`).send({
      memberId, amount: 350, paidAt: '2026-10-24', method: 'CASH', idempotencyKey: 'pay-test-1',
    });
    expect(dup.body.duplicate).toBe(true);
    const over = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${accountantToken}`).send({
      memberId, amount: 1000, paidAt: '2026-10-24', method: 'BANK', idempotencyKey: 'pay-test-2',
    });
    expect(over.body.remainingBalance).toBe(-450); // credit balance
  });
  it('reverses a payment exactly once and restores the balance', async () => {
    const list = await request(app).get('/api/v1/payments').set('Authorization', `Bearer ${accountantToken}`);
    const target = list.body.rows.find((r) => r.amount === 1000 && r.status === 'POSTED');
    const rev = await request(app).post(`/api/v1/payments/${target._id}/reverse`).set('Authorization', `Bearer ${accountantToken}`).send({ reason: 'Test reversal' });
    expect(rev.status).toBe(200);
    expect(rev.body.payment.status).toBe('REVERSED');
    const again = await request(app).post(`/api/v1/payments/${target._id}/reverse`).set('Authorization', `Bearer ${accountantToken}`).send({ reason: 'again' });
    expect(again.status).toBe(400);
    const bal = await request(app).get(`/api/v1/members/${memberId}/balance`).set('Authorization', `Bearer ${accountantToken}`);
    expect(bal.body.computedBalance).toBe(550);
    expect(bal.body.inSync).toBe(true);
  });
  it('forbids operators from recording payments', async () => {
    const res = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId, amount: 10, paidAt: '2026-10-24', method: 'CASH',
    });
    expect(res.status).toBe(403);
  });
});

describe('public visibility and member portal', () => {
  it('public profile exposes only approved fields', async () => {
    const res = await request(app).get(`/api/v1/public/members/${memberId}`);
    expect(res.status).toBe(200);
    expect(res.body.member.phone).toBeUndefined();
    expect(res.body.member.address).toBeUndefined();
    expect(res.body.member.notes).toBeUndefined();
    expect(res.body.member.businessName).toBe('Test Traders');
    expect(res.body.summary).toBeDefined();
  });
  it('members cannot read another member ledger', async () => {
    const other = await request(app).post('/api/v1/members').set('Authorization', `Bearer ${adminToken}`).send({
      businessName: 'Other Traders', ownerName: 'Other Owner', joiningDate: '2024-01-03',
    });
    const res = await request(app).get(`/api/v1/members/${other.body.member.memberId}/ledger`).set('Authorization', `Bearer ${memberUserToken}`);
    expect(res.status).toBe(403);
    const own = await request(app).get(`/api/v1/members/${memberId}/ledger`).set('Authorization', `Bearer ${memberUserToken}`);
    expect(own.status).toBe(200);
  });
  it('public directory needs no auth', async () => {
    const res = await request(app).get(`/api/v1/public/members`);
    expect(res.status).toBe(200);
    expect(res.body.members.length).toBeGreaterThan(0);
  });
});

describe('dashboard consistency', () => {
  it('dashboard totals match direct ledger aggregation', async () => {
    const dash = await request(app).get('/api/v1/admin/dashboard').set('Authorization', `Bearer ${adminToken}`);
    expect(dash.status).toBe(200);
    const direct = await prisma.member.aggregate({ where: { status: 'ACTIVE' }, _sum: { outstandingBalance: true } });
    expect(dash.body.totalOutstanding).toBe(direct._sum.outstandingBalance || 0);
    expect(dash.body.activeMembers).toBeGreaterThanOrEqual(3);
  });
});

describe('transaction rollback', () => {
  it('a failed vehicle entry leaves no partial documents', async () => {
    const before = await prisma.vehicleEntry.count({});
    const res = await request(app).post('/api/v1/vehicles').set('Authorization', `Bearer ${operatorToken}`).send({
      memberId: 'NAK-9999', entryDate: '2026-10-24', quantity: 2,
    });
    expect(res.status).toBe(404);
    expect(await prisma.vehicleEntry.count({})).toBe(before);
  });
});
