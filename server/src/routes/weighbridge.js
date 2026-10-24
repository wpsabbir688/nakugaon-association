import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { WEIGHBRIDGE_CATEGORIES } from '../constants.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postCharge, audit } from '../services/ledgerService.js';
import { withId, memberRef } from '../utils/serialize.js';

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

function shapeRow(r) {
  const row = withId(r);
  row.member = memberRef(r.member);
  return row;
}

weighbridgeRouter.get('/categories', requireAuth, asyncHandler(async (_req, res) => {
  const rules = await prisma.feeRule.findMany({ where: { category: 'WEIGHBRIDGE' } });
  res.json({ categories: WEIGHBRIDGE_CATEGORIES.map((c) => ({ ...c, amount: rules.find((r) => r.key === c.key)?.amount ?? null })) });
}));

weighbridgeRouter.get('/', requireAuth, requirePermission('weighbridge:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), category: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = {};
  if (req.query.memberId) {
    const m = await prisma.member.findUnique({ where: { memberId: req.query.memberId } });
    if (m) where.memberId = m.id;
  }
  if (req.query.category) where.category = req.query.category;
  if (req.query.from || req.query.to) {
    where.occurredAt = {};
    if (req.query.from) where.occurredAt.gte = new Date(req.query.from);
    if (req.query.to) where.occurredAt.lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    prisma.weighbridgeEntry.count({ where }),
    prisma.weighbridgeEntry.findMany({ where, include: { member: { select: { id: true, memberId: true, businessName: true, ownerName: true } } }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
  ]);
  res.json({ rows: rows.map(shapeRow), meta: pageMeta(total, page, limit) });
}));

weighbridgeRouter.post('/', requireAuth, requirePermission('weighbridge:write'), validate({ body: wbBody }), asyncHandler(async (req, res) => {
  const member = await prisma.member.findFirst({ where: { memberId: req.body.memberId, status: 'ACTIVE' } });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await prisma.weighbridgeEntry.findUnique({ where: { idempotencyKey: req.body.idempotencyKey }, include: { member: { select: { id: true, memberId: true, businessName: true, ownerName: true } } } });
    if (existing) return res.json({ entry: shapeRow(existing), duplicate: true });
  }
  const rule = await prisma.feeRule.findFirst({ where: { key: req.body.category, isActive: true } });
  if (!rule) throw badRequest('Fee rule for this category is not configured');
  const entry = await prisma.$transaction(async (tx) => {
    const doc = await tx.weighbridgeEntry.create({
      data: {
        memberId: member.id, occurredAt: new Date(req.body.occurredAt), category: req.body.category,
        fee: rule.amount, weightKg: req.body.weightKg ?? null, referenceNumber: req.body.referenceNumber,
        operator: req.body.operator, notes: req.body.notes, recordedById: req.user.id,
        idempotencyKey: req.body.idempotencyKey || null,
      },
    });
    const ledger = await postCharge({
      memberId: member.id, kind: 'WEIGHBRIDGE_CHARGE', amount: rule.amount,
      reference: `WB-${doc.id.slice(-6).toUpperCase()}`,
      referenceType: 'WeighbridgeEntry', referenceId: doc.id, incomeAccount: 'WEIGHBRIDGE_INCOME',
      recordedBy: req.user.id, occurredAt: new Date(req.body.occurredAt),
      idempotencyKey: req.body.idempotencyKey ? `wb-${req.body.idempotencyKey}` : null, tx,
    });
    return tx.weighbridgeEntry.update({ where: { id: doc.id }, data: { ledgerEntryId: ledger.id } });
  });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'weighbridge.create', entity: 'WeighbridgeEntry', entityId: entry.id, details: { memberId: member.memberId, category: req.body.category, fee: rule.amount }, ipAddress: req.ip });
  res.status(201).json({ entry: withId(entry) });
}));
