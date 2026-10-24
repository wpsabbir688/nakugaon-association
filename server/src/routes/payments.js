import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Member } from '../models/Member.js';
import { Payment } from '../models/Payments.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { nextSeq } from '../models/Counter.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postPayment, reverseLedger, audit, computeBalance } from '../services/ledgerService.js';

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

paymentsRouter.get('/', requireAuth, requirePermission('payments:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), method: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (req.query.memberId) {
    const m = await Member.findOne({ memberId: req.query.memberId });
    if (m) filter.member = m._id;
  }
  if (req.query.method) filter.method = req.query.method;
  if (req.query.from || req.query.to) {
    filter.paidAt = {};
    if (req.query.from) filter.paidAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.paidAt.$lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    Payment.countDocuments(filter),
    Payment.find(filter).populate('member', 'memberId businessName ownerName').sort({ paidAt: -1, createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

paymentsRouter.get('/:id', requireAuth, requirePermission('payments:read'), asyncHandler(async (req, res) => {
  const p = await Payment.findById(req.params.id).populate('member', 'memberId businessName ownerName');
  if (!p) throw notFound('Payment not found');
  res.json({ payment: p });
}));

paymentsRouter.post('/', requireAuth, requirePermission('payments:write'), validate({ body: paymentBody }), asyncHandler(async (req, res) => {
  const member = await Member.findOne({ memberId: req.body.memberId, status: 'ACTIVE' });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey: req.body.idempotencyKey });
    if (existing) return res.json({ payment: existing, duplicate: true });
  }
  const previousBalance = await computeBalance(member._id);
  const session = await mongoose.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      const day = new Date(req.body.paidAt).toISOString().slice(0, 10).replaceAll('-', '');
      const seq = await nextSeq(`receipt-${day}`, session);
      const receiptNumber = `REC-${day}-${String(seq).padStart(4, '0')}`;
      const [doc] = await Payment.create([{
        member: member._id, amount: req.body.amount, paidAt: new Date(req.body.paidAt),
        method: req.body.method, receiptNumber, reference: req.body.reference,
        receivedBy: req.user._id, notes: req.body.notes,
        idempotencyKey: req.body.idempotencyKey || null,
      }], { session });
      const ledger = await postPayment({
        memberId: member._id, amount: req.body.amount, reference: receiptNumber,
        referenceType: 'Payment', referenceId: doc._id, method: req.body.method,
        recordedBy: req.user._id, occurredAt: new Date(req.body.paidAt),
        idempotencyKey: req.body.idempotencyKey ? `pay-${req.body.idempotencyKey}` : null, session,
      });
      doc.ledgerEntry = ledger._id;
      await doc.save({ session });
      payment = doc;
    });
  } finally {
    await session.endSession();
  }
  const remainingBalance = await computeBalance(member._id);
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'payment.create', entity: 'Payment', entityId: payment._id.toString(), details: { memberId: member.memberId, amount: req.body.amount, receiptNumber: payment.receiptNumber }, ipAddress: req.ip });
  res.status(201).json({ payment, previousBalance, remainingBalance });
}));

// Reversal: creates a negating ledger row + mirror journal entry. The original
// payment is marked REVERSED but never deleted.
paymentsRouter.post('/:id/reverse', requireAuth, requirePermission('payments:reverse'), validate({ body: z.object({ reason: z.string().trim().min(1).max(500) }) }), asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw notFound('Payment not found');
  if (payment.status === 'REVERSED') throw badRequest('Payment was already reversed');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await reverseLedger({ ledgerId: payment.ledgerEntry, reason: req.body.reason, recordedBy: req.user._id, session });
      payment.status = 'REVERSED';
      await payment.save({ session });
    });
  } finally {
    await session.endSession();
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'payment.reverse', entity: 'Payment', entityId: payment._id.toString(), details: { reason: req.body.reason }, ipAddress: req.ip });
  res.json({ payment });
}));

void LedgerEntry;
