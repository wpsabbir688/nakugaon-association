import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest } from '../utils/errors.js';
import { postCharge, audit } from '../services/ledgerService.js';
import { withId, withIdList, memberRef } from '../utils/serialize.js';

export const vehiclesRouter = express.Router();

const vehicleBody = z.object({
  memberId: z.string().min(1),
  entryDate: z.string().min(1),
  quantity: z.number().int().min(1),
  notes: z.string().max(1000).optional().default(''),
  idempotencyKey: z.string().max(100).optional(),
});

function shapeRow(r) {
  const row = withId(r);
  row.member = memberRef(r.member);
  return row;
}

vehiclesRouter.get('/', requireAuth, requirePermission('vehicles:read'), validate({ query: paginationQuery.extend({ memberId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = {};
  if (req.query.memberId) {
    const m = await prisma.member.findUnique({ where: { memberId: req.query.memberId } });
    if (m) where.memberId = m.id;
  }
  if (req.query.from || req.query.to) {
    where.entryDate = {};
    if (req.query.from) where.entryDate.gte = new Date(req.query.from);
    if (req.query.to) where.entryDate.lte = new Date(req.query.to);
  }
  const [total, rows] = await Promise.all([
    prisma.vehicleEntry.count({ where }),
    prisma.vehicleEntry.findMany({ where, include: { member: { select: { id: true, memberId: true, businessName: true, ownerName: true } } }, orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
  ]);
  res.json({ rows: rows.map(shapeRow), meta: pageMeta(total, page, limit) });
}));

vehiclesRouter.post('/', requireAuth, requirePermission('vehicles:write'), validate({ body: vehicleBody }), asyncHandler(async (req, res) => {
  const member = await prisma.member.findFirst({ where: { memberId: req.body.memberId, status: 'ACTIVE' } });
  if (!member) throw notFound('Active member not found');
  if (req.body.idempotencyKey) {
    const existing = await prisma.vehicleEntry.findUnique({ where: { idempotencyKey: req.body.idempotencyKey }, include: { member: { select: { id: true, memberId: true, businessName: true, ownerName: true } } } });
    if (existing) return res.json({ entry: shapeRow(existing), duplicate: true });
  }
  const rule = await prisma.feeRule.findFirst({ where: { key: 'VEHICLE_PER_UNIT', isActive: true } });
  if (!rule) throw badRequest('Vehicle fee rule is not configured');
  const feePerVehicle = rule.amount;
  const total = req.body.quantity * feePerVehicle;
  const entry = await prisma.$transaction(async (tx) => {
    const doc = await tx.vehicleEntry.create({
      data: {
        memberId: member.id, entryDate: new Date(req.body.entryDate), quantity: req.body.quantity,
        feePerVehicle, total, notes: req.body.notes, recordedById: req.user.id,
        idempotencyKey: req.body.idempotencyKey || null,
      },
    });
    const ledger = await postCharge({
      memberId: member.id, kind: 'VEHICLE_CHARGE', amount: total,
      reference: `VEH-${doc.id.slice(-6).toUpperCase()}`,
      referenceType: 'VehicleEntry', referenceId: doc.id, incomeAccount: 'VEHICLE_INCOME',
      recordedBy: req.user.id, occurredAt: new Date(req.body.entryDate),
      idempotencyKey: req.body.idempotencyKey ? `veh-${req.body.idempotencyKey}` : null, tx,
    });
    return tx.vehicleEntry.update({ where: { id: doc.id }, data: { ledgerEntryId: ledger.id } });
  });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'vehicle.create', entity: 'VehicleEntry', entityId: entry.id, details: { memberId: member.memberId, quantity: req.body.quantity, total }, ipAddress: req.ip });
  res.status(201).json({ entry: withId(entry) });
}));
