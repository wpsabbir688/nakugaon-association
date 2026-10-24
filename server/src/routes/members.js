import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Member } from '../models/Member.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { nextSeq } from '../models/Counter.js';
import { requireAuth, requirePermission, requireOwnMemberOrStaff } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta, safeSearchRegex } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest, forbidden } from '../utils/errors.js';
import { audit, computeBalance } from '../services/ledgerService.js';
import { env } from '../config/env.js';

export const membersRouter = express.Router();

// Local upload driver (implemented). Files are validated by type + size and
// stored under a random name — never the user-supplied filename.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    return cb(badRequest('Only JPG, PNG, or WebP images are allowed'));
  },
});

const memberBody = z.object({
  businessName: z.string().trim().min(1).max(200),
  ownerName: z.string().trim().min(1).max(120),
  fatherName: z.string().trim().max(120).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  phone: z.string().trim().max(30).optional().default(''),
  joiningDate: z.string().min(1),
  registrationInfo: z.string().trim().max(500).optional().default(''),
  openingBalance: z.number().int().min(0).optional().default(0),
});

membersRouter.get('/', requireAuth, requirePermission('members:read'), validate({ query: paginationQuery.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = {};
  if (req.user.role === 'MEMBER') {
    // Members may only ever see their own record, even via the list endpoint.
    if (!req.user.memberId) return res.json({ members: [], meta: pageMeta(0, page, limit) });
    filter._id = req.user.memberId;
  } else {
    if (req.query.status) filter.status = req.query.status;
    if (req.query.search) {
      const rx = safeSearchRegex(req.query.search);
      filter.$or = [{ businessName: rx }, { ownerName: rx }, { memberId: rx }];
    }
  }
  const [total, members] = await Promise.all([
    Member.countDocuments(filter),
    Member.find(filter).sort({ memberId: 1 }).skip(skip).limit(limit),
  ]);
  res.json({ members, meta: pageMeta(total, page, limit) });
}));

membersRouter.get('/:memberId', requireAuth, requirePermission('members:read'), asyncHandler(async (req, res) => {
  const m = await Member.findOne({ memberId: req.params.memberId });
  if (!m) throw notFound('Member not found');
  if (req.user.role === 'MEMBER' && (!req.user.memberId || !req.user.memberId.equals(m._id))) throw forbidden();
  res.json({ member: m });
}));

membersRouter.post('/', requireAuth, requirePermission('members:write'), validate({ body: memberBody }), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let member;
  try {
    await session.withTransaction(async () => {
      const seq = await nextSeq('member', session);
      const memberId = `NAK-${String(seq).padStart(4, '0')}`;
      const [doc] = await Member.create([{
        memberId,
        businessName: req.body.businessName,
        ownerName: req.body.ownerName,
        fatherName: req.body.fatherName,
        address: req.body.address,
        phone: req.body.phone,
        joiningDate: new Date(req.body.joiningDate),
        registrationInfo: req.body.registrationInfo,
        openingBalance: req.body.openingBalance,
        outstandingBalance: req.body.openingBalance,
      }], { session });
      member = doc;
      if (req.body.openingBalance > 0) {
        await LedgerEntry.create([{
          member: doc._id, kind: 'OPENING', amount: req.body.openingBalance,
          runningBalance: req.body.openingBalance, reference: 'OPENING',
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'member.create', entity: 'Member', entityId: member.memberId, ipAddress: req.ip });
  res.status(201).json({ member });
}));

membersRouter.patch('/:memberId', requireAuth, requirePermission('members:write'), validate({ body: memberBody.partial().omit({ openingBalance: true }) }), asyncHandler(async (req, res) => {
  const m = await Member.findOneAndUpdate({ memberId: req.params.memberId }, { $set: req.body }, { new: true });
  if (!m) throw notFound('Member not found');
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'member.update', entity: 'Member', entityId: m.memberId, ipAddress: req.ip });
  res.json({ member: m });
}));

membersRouter.post('/:memberId/archive', requireAuth, requirePermission('members:archive'), asyncHandler(async (req, res) => {
  const m = await Member.findOneAndUpdate({ memberId: req.params.memberId }, { $set: { status: 'ARCHIVED' } }, { new: true });
  if (!m) throw notFound('Member not found');
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'member.archive', entity: 'Member', entityId: m.memberId, ipAddress: req.ip });
  res.json({ member: m });
}));

membersRouter.post('/:memberId/photo', requireAuth, requirePermission('members:write'), upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No image uploaded');
  const m = await Member.findOneAndUpdate(
    { memberId: req.params.memberId },
    { $set: { profileImageUrl: `/uploads/${req.file.filename}` } },
    { new: true }
  );
  if (!m) throw notFound('Member not found');
  res.json({ profileImageUrl: m.profileImageUrl });
}));

membersRouter.get('/:memberId/ledger', requireAuth, requirePermission('ledger:read'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const m = await Member.findOne({ memberId: req.params.memberId });
  if (!m) throw notFound('Member not found');
  if (req.user.role === 'MEMBER' && (!req.user.memberId || !req.user.memberId.equals(m._id))) throw forbidden();
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    LedgerEntry.countDocuments({ member: m._id }),
    LedgerEntry.find({ member: m._id }).sort({ occurredAt: -1, createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

membersRouter.get('/:memberId/balance', requireAuth, requirePermission('ledger:read'), asyncHandler(async (req, res) => {
  const m = await Member.findOne({ memberId: req.params.memberId });
  if (!m) throw notFound('Member not found');
  if (req.user.role === 'MEMBER' && (!req.user.memberId || !req.user.memberId.equals(m._id))) throw forbidden();
  const computed = await computeBalance(m._id);
  res.json({ memberId: m.memberId, cachedBalance: m.outstandingBalance, computedBalance: computed, inSync: computed === m.outstandingBalance, openingBalance: m.openingBalance });
}));

void requireOwnMemberOrStaff;
