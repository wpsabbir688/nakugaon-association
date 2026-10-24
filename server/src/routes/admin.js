import express from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { audit, reconcileAll } from '../services/ledgerService.js';
import { withId, withIdList, memberRef, safeUser } from '../utils/serialize.js';

export const adminRouter = express.Router();

// "Today" means today in Asia/Dhaka, not server time (Render runs on UTC).
// Dhaka is UTC+06:00 year-round (no DST), so the offset is fixed. The old
// code used the server's local date, which showed yesterday's figures for
// the first 6 hours of every Dhaka day.
function dhakaDayRange(dateStr) {
  let y;
  let m;
  let d;
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [y, m, d] = dateStr.split('-').map(Number);
  } else {
    const dhakaNow = new Date(Date.now() + 6 * 60 * 60 * 1000);
    y = dhakaNow.getUTCFullYear();
    m = dhakaNow.getUTCMonth() + 1;
    d = dhakaNow.getUTCDate();
  }
  const start = new Date(Date.UTC(y, m - 1, d) - 6 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

adminRouter.get('/dashboard', requireAuth, requirePermission('reports:read'), asyncHandler(async (req, res) => {
  const { start, end } = dhakaDayRange(req.query.date);
  // One parallel batch (was two sequential batches) so the dashboard needs
  // a single round of queries instead of waiting twice.
  const since = new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000);
  const [activeMembers, todayVehicleAgg, todayWbAgg, todayPaymentAgg, outstandingAgg, recentTx, recentMembers, vehicleTrendRaw, wbByCategoryRaw, paymentTrendRaw, topOutstanding] = await Promise.all([
    prisma.member.count({ where: { status: 'ACTIVE' } }),
    prisma.vehicleEntry.aggregate({ where: { entryDate: { gte: start, lt: end } }, _sum: { quantity: true, total: true } }),
    prisma.weighbridgeEntry.aggregate({ where: { occurredAt: { gte: start, lt: end }, status: 'POSTED' }, _sum: { fee: true } }),
    prisma.payment.aggregate({ where: { paidAt: { gte: start, lt: end }, status: 'POSTED' }, _sum: { amount: true } }),
    prisma.member.aggregate({ where: { status: 'ACTIVE' }, _sum: { outstandingBalance: true } }),
    prisma.ledgerEntry.findMany({ orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 10, include: { member: { select: { id: true, memberId: true, businessName: true, ownerName: true } } } }),
    prisma.member.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, memberId: true, businessName: true, ownerName: true, status: true, createdAt: true } }),
    // Trend dates are grouped in Asia/Dhaka so chart labels match the day
    // the association actually operated, not the UTC day.
    prisma.$queryRaw`
      SELECT TO_CHAR("entryDate" AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS date, SUM("quantity") AS vehicles, SUM("total") AS amount
      FROM "VehicleEntry" WHERE "entryDate" >= ${since} GROUP BY date ORDER BY date`,
    prisma.weighbridgeEntry.groupBy({ by: ['category'], where: { status: 'POSTED' }, _sum: { fee: true }, _count: { _all: true } }),
    prisma.$queryRaw`
      SELECT TO_CHAR("paidAt" AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD') AS date, SUM("amount") AS total
      FROM "Payment" WHERE "status" = 'POSTED' AND "paidAt" >= ${since} GROUP BY date ORDER BY date`,
    prisma.member.findMany({ where: { status: 'ACTIVE' }, orderBy: { outstandingBalance: 'desc' }, take: 10, select: { memberId: true, businessName: true, outstandingBalance: true } }),
  ]);
  const vehicleTrend = vehicleTrendRaw.map((r) => ({ _id: r.date, vehicles: Number(r.vehicles), amount: Number(r.amount) }));
  const wbByCategory = wbByCategoryRaw.map((r) => ({ _id: r.category, total: r._sum.fee || 0, count: r._count._all }));
  const paymentTrend = paymentTrendRaw.map((r) => ({ _id: r.date, total: Number(r.total) }));
  const recentTransactions = recentTx.map((t) => {
    const row = withId(t);
    row.member = memberRef(t.member);
    return row;
  });
  res.json({
    activeMembers,
    todayVehicleCount: todayVehicleAgg._sum.quantity || 0,
    todayVehicleCharges: todayVehicleAgg._sum.total || 0,
    todayWeighbridgeCharges: todayWbAgg._sum.fee || 0,
    todayPayments: todayPaymentAgg._sum.amount || 0,
    totalOutstanding: outstandingAgg._sum.outstandingBalance || 0,
    recentTransactions,
    recentMembers: withIdList(recentMembers),
    charts: { vehicleTrend, wbByCategory, paymentTrend, topOutstanding: topOutstanding.map((m) => ({ memberId: m.memberId, businessName: m.businessName, outstandingBalance: m.outstandingBalance })) },
  });
}));

adminRouter.get('/users', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ users: users.map(safeUser) });
}));

adminRouter.post('/users', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), role: z.enum(['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'OPERATOR', 'MEMBER']), memberId: z.string().optional() }) }), asyncHandler(async (req, res) => {
  let linkedMember = null;
  if (req.body.memberId) {
    linkedMember = await prisma.member.findUnique({ where: { memberId: req.body.memberId } });
    if (!linkedMember) throw notFound('Member not found for linking');
  }
  const user = await prisma.user.create({
    data: {
      name: req.body.name, email: req.body.email.toLowerCase(),
      passwordHash: await bcrypt.hash(req.body.password, 12),
      role: req.body.role, memberId: linkedMember?.id || null,
    },
  });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'user.create', entity: 'User', entityId: user.id, ipAddress: req.ip });
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}));

adminRouter.post('/reconcile', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const result = await reconcileAll();
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'ledger.reconcile', entity: 'Member', details: result, ipAddress: req.ip });
  res.json(result);
}));

adminRouter.patch('/users/:id/status', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ isActive: z.boolean() }) }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('You cannot deactivate yourself');
  let user;
  try {
    user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('User not found');
    throw err;
  }
  res.json({ user: { id: user.id, isActive: user.isActive } });
}));
