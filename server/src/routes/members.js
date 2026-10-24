import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { nextSeq } from '../constants.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta, searchFilter } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound, badRequest, forbidden } from '../utils/errors.js';
import { audit, computeBalance } from '../services/ledgerService.js';
import { withId, withIdList } from '../utils/serialize.js';
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

function ownMemberGuard(req, member) {
  if (req.user.role === 'MEMBER' && (!req.user.memberId || req.user.memberId !== member.id)) throw forbidden();
}

membersRouter.get('/', requireAuth, requirePermission('members:read'), validate({ query: paginationQuery.extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }) }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = {};
  if (req.user.role === 'MEMBER') {
    // Members may only ever see their own record, even via the list endpoint.
    if (!req.user.memberId) return res.json({ members: [], meta: pageMeta(0, page, limit) });
    where.id = req.user.memberId;
  } else {
    if (req.query.status) where.status = req.query.status;
    if (req.query.search) Object.assign(where, searchFilter(req.query.search, ['businessName', 'ownerName', 'memberId']));
  }
  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({ where, orderBy: { memberId: 'asc' }, skip, take: limit }),
  ]);
  res.json({ members: withIdList(members), meta: pageMeta(total, page, limit) });
}));

membersRouter.get('/:memberId', requireAuth, requirePermission('members:read'), asyncHandler(async (req, res) => {
  const m = await prisma.member.findUnique({ where: { memberId: req.params.memberId } });
  if (!m) throw notFound('Member not found');
  ownMemberGuard(req, m);
  res.json({ member: withId(m) });
}));

membersRouter.post('/', requireAuth, requirePermission('members:write'), validate({ body: memberBody }), asyncHandler(async (req, res) => {
  const member = await prisma.$transaction(async (tx) => {
    const seq = await nextSeq(tx, 'member');
    const memberId = `NAK-${String(seq).padStart(4, '0')}`;
    const doc = await tx.member.create({
      data: {
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
      },
    });
    if (req.body.openingBalance > 0) {
      await tx.ledgerEntry.create({
        data: { memberId: doc.id, kind: 'OPENING', amount: req.body.openingBalance, runningBalance: req.body.openingBalance, reference: 'OPENING' },
      });
    }
    return doc;
  });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'member.create', entity: 'Member', entityId: member.memberId, ipAddress: req.ip });
  res.status(201).json({ member: withId(member) });
}));

membersRouter.patch('/:memberId', requireAuth, requirePermission('members:write'), validate({ body: memberBody.partial().omit({ openingBalance: true }) }), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  if (data.joiningDate) data.joiningDate = new Date(data.joiningDate);
  let m;
  try {
    m = await prisma.member.update({ where: { memberId: req.params.memberId }, data });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('Member not found');
    throw err;
  }
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'member.update', entity: 'Member', entityId: m.memberId, ipAddress: req.ip });
  res.json({ member: withId(m) });
}));

membersRouter.post('/:memberId/archive', requireAuth, requirePermission('members:archive'), asyncHandler(async (req, res) => {
  let m;
  try {
    m = await prisma.member.update({ where: { memberId: req.params.memberId }, data: { status: 'ARCHIVED' } });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('Member not found');
    throw err;
  }
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'member.archive', entity: 'Member', entityId: m.memberId, ipAddress: req.ip });
  res.json({ member: withId(m) });
}));

membersRouter.post('/:memberId/photo', requireAuth, requirePermission('members:write'), upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) throw badRequest('No image uploaded');
  let m;
  try {
    m = await prisma.member.update({ where: { memberId: req.params.memberId }, data: { profileImageUrl: `/uploads/${req.file.filename}` } });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('Member not found');
    throw err;
  }
  res.json({ profileImageUrl: m.profileImageUrl });
}));

membersRouter.get('/:memberId/ledger', requireAuth, requirePermission('ledger:read'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const m = await prisma.member.findUnique({ where: { memberId: req.params.memberId } });
  if (!m) throw notFound('Member not found');
  ownMemberGuard(req, m);
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    prisma.ledgerEntry.count({ where: { memberId: m.id } }),
    prisma.ledgerEntry.findMany({ where: { memberId: m.id }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
  ]);
  res.json({ rows: withIdList(rows), meta: pageMeta(total, page, limit) });
}));

membersRouter.get('/:memberId/balance', requireAuth, requirePermission('ledger:read'), asyncHandler(async (req, res) => {
  const m = await prisma.member.findUnique({ where: { memberId: req.params.memberId } });
  if (!m) throw notFound('Member not found');
  ownMemberGuard(req, m);
  const computed = await computeBalance(m.id);
  res.json({ memberId: m.memberId, cachedBalance: m.outstandingBalance, computedBalance: computed, inSync: computed === m.outstandingBalance, openingBalance: m.openingBalance });
}));
