import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { nextSeq } from '../constants.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postPayment, reverseLedger, audit, computeBalance } from '../services/ledgerService.js';
import { withId, memberRef } from '../utils/serialize.js';

export const paymentsRouter = express.Router();

// Overpayment policy (documented in README): a payment larger than the
// outstanding balance is accepted and the excess becomes a credit balance
// (negative outstanding). It is never silently discarded or refunded.
const paymentBody = z.object({
  memberId: z.string().min(1),
  amount: z.number().int().min(1),
  paidAt: z.string().min(1),
  method: z.enum(['CASH', 'BANK', 'OTHER']),
  reference: z.string().max(100).optional().default(''),
  notes: z.string().max(1000).optional().default(''),
  idempotencyKey: z.string().max(100).optional(),
});

function shapeRow(r) {
  const row = withId(r);
  row.member = memberRef(r.member);
  return row;
}

const memberSelect = { select: { id: true, memberId: true, businessName: true, ownerName: true } };

paymentsRouter.get('/', requireAuth, requirePermission('payments:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), method: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = {};
  if (req.query.memberId) {
    const m = await prisma.member.findUnique({ where: { memberId: req.query.memberId } });
    if (m) where.memberId = m.id;
  }
  if (req.query.method) where.method = req.query.method;
  if (req.query.from || req.query.to) {
    where.paidAt = {};
    if (req.query.from) where.paidAt.gte = new Date(req.query.from);
    if (req.query.to) where.paidAt.lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, include: { member: memberSelect }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
  ]);
  res.json({ rows: rows.map(shapeRow), meta: pageMeta(total, page, limit) });
}));

paymentsRouter.get('/:id', requireAuth, requirePermission('payments:read'), asyncHandler(async (req, res) => {
  const p = await prisma.payment.findUnique({ where: { id: req.params.id }, include: { member: memberSelect } });
  if (!p) throw notFound('Payment not found');
  res.json({ payment: shapeRow(p) });
}));

paymentsRouter.post('/', requireAuth, requirePermission('payments:write'), validate({ body: paymentBody }), asyncHandler(async (req, res) => {
  const member = await prisma.member.findFirst({ where: { memberId: req.body.memberId, status: 'ACTIVE' } });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: req.body.idempotencyKey }, include: { member: memberSelect } });
    if (existing) return res.json({ payment: shapeRow(existing), duplicate: true });
  }
  const previousBalance = await computeBalance(member.id);
  const payment = await prisma.$transaction(async (tx) => {
    const day = new Date(req.body.paidAt).toISOString().slice(0, 10).replaceAll('-', '');
    const seq = await nextSeq(tx, `receipt-${day}`);
    const receiptNumber = `REC-${day}-${String(seq).padStart(4, '0')}`;
    const doc = await tx.payment.create({
      data: {
        memberId: member.id, amount: req.body.amount, paidAt: new Date(req.body.paidAt),
        method: req.body.method, receiptNumber, reference: req.body.reference,
        receivedById: req.user.id, notes: req.body.notes,
        idempotencyKey: req.body.idempotencyKey || null,
      },
    });
    const ledger = await postPayment({
      memberId: member.id, amount: req.body.amount, reference: receiptNumber,
      referenceType: 'Payment', referenceId: doc.id, method: req.body.method,
      recordedBy: req.user.id, occurredAt: new Date(req.body.paidAt),
      idempotencyKey: req.body.idempotencyKey ? `pay-${req.body.idempotencyKey}` : null, tx,
    });
    return tx.payment.update({ where: { id: doc.id }, data: { ledgerEntryId: ledger.id } });
  });
  const remainingBalance = await computeBalance(member.id);
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'payment.create', entity: 'Payment', entityId: payment.id, details: { memberId: member.memberId, amount: req.body.amount, receiptNumber: payment.receiptNumber }, ipAddress: req.ip });
  res.status(201).json({ payment: withId(payment), previousBalance, remainingBalance });
}));

// Reversal: creates a negating ledger row + mirror journal entry. The original
// payment is marked REVERSED but never deleted.
paymentsRouter.post('/:id/reverse', requireAuth, requirePermission('payments:reverse'), validate({ body: z.object({ reason: z.string().trim().min(1).max(500) }) }), asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) throw notFound('Payment not found');
  if (payment.status === 'REVERSED') throw badRequest('Payment was already reversed');
  await prisma.$transaction(async (tx) => {
    await reverseLedger({ ledgerId: payment.ledgerEntryId, reason: req.body.reason, recordedBy: req.user.id, tx });
    await tx.payment.update({ where: { id: payment.id }, data: { status: 'REVERSED' } });
  });
  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'payment.reverse', entity: 'Payment', entityId: payment.id, details: { reason: req.body.reason }, ipAddress: req.ip });
  res.json({ payment: withId(updated) });
}));
