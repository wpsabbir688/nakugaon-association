import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Member } from '../models/Member.js';
import { FeeRule, WEIGHBRIDGE_CATEGORIES } from '../models/FeeRule.js';
import { WeighbridgeEntry } from '../models/Entries.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postCharge, audit } from '../services/ledgerService.js';

export const weighbridgeRouter = express.Router();

const wbBody = z.object({
  memberId: z.string().min(1),
  occurredAt: z.string().min(1),
  category: z.enum(['WB_BHUTAN', 'WB_BD', 'WB_LORRY', 'WB_TROLLEY']),
  weightKg: z.number().positive().optional().nullable(),
  referenceNumber: z.string().max(100).optional().default(''),
  operator: z.string().max(120).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
  idempotencyKey: z.string().max(100).optional(),
});

weighbridgeRouter.get('/categories', requireAuth, asyncHandler(async (_req, res) => {
  const rules = await FeeRule.find({ category: 'WEIGHBRIDGE' });
  res.json({ categories: WEIGHBRIDGE_CATEGORIES.map((c) => ({ ...c, amount: rules.find((r) => r.key === c.key)?.amount ?? null })) });
}));

weighbridgeRouter.get('/', requireAuth, requirePermission('weighbridge:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), category: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (req.query.memberId) {
    const m = await Member.findOne({ memberId: req.query.memberId });
    if (m) filter.member = m._id;
  }
  if (req.query.category) filter.category = req.query.category;
  if (req.query.from || req.query.to) {
    filter.occurredAt = {};
    if (req.query.from) filter.occurredAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.occurredAt.$lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    WeighbridgeEntry.countDocuments(filter),
    WeighbridgeEntry.find(filter).populate('member', 'memberId businessName ownerName').sort({ occurredAt: -1, createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

weighbridgeRouter.post('/', requireAuth, requirePermission('weighbridge:write'), validate({ body: wbBody }), asyncHandler(async (req, res) => {
  const member = await Member.findOne({ memberId: req.body.memberId, status: 'ACTIVE' });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await WeighbridgeEntry.findOne({ idempotencyKey: req.body.idempotencyKey });
    if (existing) return res.json({ entry: existing, duplicate: true });
  }
  const rule = await FeeRule.findOne({ key: req.body.category, isActive: true });
  if (!rule) throw badRequest('Fee rule for this category is not configured');
  const session = await mongoose.startSession();
  let entry;
  try {
    await session.withTransaction(async () => {
      const [doc] = await WeighbridgeEntry.create([{
        member: member._id, occurredAt: new Date(req.body.occurredAt), category: req.body.category,
        fee: rule.amount, weightKg: req.body.weightKg ?? null, referenceNumber: req.body.referenceNumber,
        operator: req.body.operator, notes: req.body.notes, recordedBy: req.user._id,
        idempotencyKey: req.body.idempotencyKey || null,
      }], { session });
      const ledger = await postCharge({
        memberId: member._id, kind: 'WEIGHBRIDGE_CHARGE', amount: rule.amount,
        reference: `WB-${doc._id.toString().slice(-6).toUpperCase()}`,
        referenceType: 'WeighbridgeEntry', referenceId: doc._id, incomeAccount: 'WEIGHBRIDGE_INCOME',
        recordedBy: req.user._id, occurredAt: new Date(req.body.occurredAt),
        idempotencyKey: req.body.idempotencyKey ? `wb-${req.body.idempotencyKey}` : null, session,
      });
      doc.ledgerEntry = ledger._id;
      await doc.save({ session });
      entry = doc;
    });
  } finally {
    await session.endSession();
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'weighbridge.create', entity: 'WeighbridgeEntry', entityId: entry._id.toString(), details: { memberId: member.memberId, category: req.body.category, fee: rule.amount }, ipAddress: req.ip });
  res.status(201).json({ entry });
}));
