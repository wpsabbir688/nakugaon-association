import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Member } from '../models/Member.js';
import { FeeRule } from '../models/FeeRule.js';
import { VehicleEntry } from '../models/Entries.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postCharge, audit } from '../services/ledgerService.js';

export const vehiclesRouter = express.Router();

const vehicleBody = z.object({
  memberId: z.string().min(1),
  entryDate: z.string().min(1),
  quantity: z.number().int().min(1),
  notes: z.string().max(1000).optional().default(''),
  idempotencyKey: z.string().max(100).optional(),
});

vehiclesRouter.get('/', requireAuth, requirePermission('vehicles:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (req.query.memberId) {
    const m = await Member.findOne({ memberId: req.query.memberId });
    if (m) filter.member = m._id;
  }
  if (req.query.from || req.query.to) {
    filter.entryDate = {};
    if (req.query.from) filter.entryDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.entryDate.$lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    VehicleEntry.countDocuments(filter),
    VehicleEntry.find(filter).populate('member', 'memberId businessName ownerName').sort({ entryDate: -1, createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

vehiclesRouter.post('/', requireAuth, requirePermission('vehicles:write'), validate({ body: vehicleBody }), asyncHandler(async (req, res) => {
  const member = await Member.findOne({ memberId: req.body.memberId, status: 'ACTIVE' });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await VehicleEntry.findOne({ idempotencyKey: req.body.idempotencyKey });
    if (existing) return res.json({ entry: existing, duplicate: true });
  }
  const rule = await FeeRule.findOne({ key: 'VEHICLE_PER_UNIT', isActive: true });
  if (!rule) throw badRequest('Vehicle fee rule is not configured');
  const feePerVehicle = rule.amount;
  const total = req.body.quantity * feePerVehicle;
  const session = await mongoose.startSession();
  let entry;
  try {
    await session.withTransaction(async () => {
      const [doc] = await VehicleEntry.create([{
        member: member._id, entryDate: new Date(req.body.entryDate), quantity: req.body.quantity,
        feePerVehicle, total, notes: req.body.notes, recordedBy: req.user._id,
        idempotencyKey: req.body.idempotencyKey || null,
      }], { session });
      const ledger = await postCharge({
        memberId: member._id, kind: 'VEHICLE_CHARGE', amount: total,
        reference: `VEH-${doc._id.toString().slice(-6).toUpperCase()}`,
        referenceType: 'VehicleEntry', referenceId: doc._id, incomeAccount: 'VEHICLE_INCOME',
        recordedBy: req.user._id, occurredAt: new Date(req.body.entryDate),
        idempotencyKey: req.body.idempotencyKey ? `veh-${req.body.idempotencyKey}` : null, session,
      });
      doc.ledgerEntry = ledger._id;
      await doc.save({ session });
      entry = doc;
    });
  } finally {
    await session.endSession();
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'vehicle.create', entity: 'VehicleEntry', entityId: entry._id.toString(), details: { memberId: member.memberId, quantity: req.body.quantity, total }, ipAddress: req.ip });
  res.status(201).json({ entry });
}));
