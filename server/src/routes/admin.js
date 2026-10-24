import express from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Member } from '../models/Member.js';
import { VehicleEntry, WeighbridgeEntry } from '../models/Entries.js';
import { Payment, Expense } from '../models/Payments.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { audit, reconcileAll } from '../services/ledgerService.js';

export const adminRouter = express.Router();

function dayRange(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

adminRouter.get('/dashboard', requireAuth, requirePermission('reports:read'), asyncHandler(async (req, res) => {
  const { start, end } = dayRange(req.query.date);
  const [activeMembers, todayVehicles, todayVehicleCharges, todayWbCharges, todayPayments, outstandingAgg, recentTx, recentMembers] = await Promise.all([
    Member.countDocuments({ status: 'ACTIVE' }),
    VehicleEntry.aggregate([{ $match: { entryDate: { $gte: start, $lt: end } } }, { $group: { _id: null, count: { $sum: '$quantity' }, amount: { $sum: '$total' } } }]),
    VehicleEntry.aggregate([{ $match: { entryDate: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    WeighbridgeEntry.aggregate([{ $match: { occurredAt: { $gte: start, $lt: end }, status: 'POSTED' } }, { $group: { _id: null, total: { $sum: '$fee' } } }]),
    Payment.aggregate([{ $match: { paidAt: { $gte: start, $lt: end }, status: 'POSTED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Member.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: null, total: { $sum: '$outstandingBalance' } } }]),
    LedgerEntry.find({}).sort({ occurredAt: -1, createdAt: -1 }).limit(10).populate('member', 'memberId businessName'),
    Member.find({}).sort({ createdAt: -1 }).limit(5),
  ]);
  // Daily vehicle trend (last 14 days) + weighbridge by category + payment trend.
  const since = new Date();
  since.setDate(since.getDate() - 14);
  const [vehicleTrend, wbByCategory, paymentTrend, topOutstanding] = await Promise.all([
    VehicleEntry.aggregate([
      { $match: { entryDate: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate' } }, vehicles: { $sum: '$quantity' }, amount: { $sum: '$total' } } },
      { $sort: { _id: 1 } },
    ]),
    WeighbridgeEntry.aggregate([
      { $match: { status: 'POSTED' } },
      { $group: { _id: '$category', total: { $sum: '$fee' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate([
      { $match: { status: 'POSTED', paidAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt' } }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
    Member.find({ status: 'ACTIVE' }).sort({ outstandingBalance: -1 }).limit(10),
  ]);
  res.json({
    activeMembers,
    todayVehicleCount: todayVehicles[0]?.count || 0,
    todayVehicleCharges: todayVehicleCharges[0]?.total || 0,
    todayWeighbridgeCharges: todayWbCharges[0]?.total || 0,
    todayPayments: todayPayments[0]?.total || 0,
    totalOutstanding: outstandingAgg[0]?.total || 0,
    recentTransactions: recentTx,
    recentMembers,
    charts: { vehicleTrend, wbByCategory, paymentTrend, topOutstanding: topOutstanding.map((m) => ({ memberId: m.memberId, businessName: m.businessName, outstandingBalance: m.outstandingBalance })) },
  });
}));

adminRouter.get('/users', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const users = await User.find({}).select('-passwordHash -refreshTokenHash').sort({ createdAt: -1 });
  res.json({ users });
}));

adminRouter.post('/users', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(8), role: z.enum(['SUPER_ADMIN', 'MANAGER', 'ACCOUNTANT', 'OPERATOR', 'MEMBER']), memberId: z.string().optional() }) }), asyncHandler(async (req, res) => {
  let linkedMember = null;
  if (req.body.memberId) {
    linkedMember = await Member.findOne({ memberId: req.body.memberId });
    if (!linkedMember) throw notFound('Member not found for linking');
  }
  const user = await User.create({
    name: req.body.name, email: req.body.email,
    passwordHash: await bcrypt.hash(req.body.password, 12),
    role: req.body.role, memberId: linkedMember?._id || null,
  });
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'user.create', entity: 'User', entityId: user._id.toString(), ipAddress: req.ip });
  res.status(201).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
}));

adminRouter.post('/reconcile', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  const result = await reconcileAll();
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'ledger.reconcile', entity: 'Member', details: result, ipAddress: req.ip });
  res.json(result);
}));

adminRouter.patch('/users/:id/status', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ isActive: z.boolean() }) }), asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) throw badRequest('You cannot deactivate yourself');
  const user = await User.findByIdAndUpdate(req.params.id, { $set: { isActive: req.body.isActive } }, { new: true });
  if (!user) throw notFound('User not found');
  res.json({ user: { id: user._id, isActive: user.isActive } });
}));
