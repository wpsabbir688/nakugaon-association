import express from 'express';
import { prisma } from '../config/db.js';
import { paginationQuery, paginate, pageMeta, searchFilter } from '../middleware/validate.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/errors.js';

export const publicRouter = express.Router();

// ONLY approved public fields leave this router. Phone, address, father's
// name, notes, and all auth/audit data are never serialized here.
function publicMember(m) {
  return {
    memberId: m.memberId,
    businessName: m.businessName,
    ownerName: m.ownerName,
    profileImageUrl: m.profileImageUrl,
    status: m.status,
    joiningDate: m.joiningDate,
    outstandingBalance: m.outstandingBalance,
    updatedAt: m.updatedAt,
  };
}

async function balanceSummary(memberDbId) {
  const rows = await prisma.ledgerEntry.groupBy({ by: ['kind'], where: { memberId: memberDbId }, _sum: { amount: true } });
  const byKind = Object.fromEntries(rows.map((r) => [r.kind, r._sum.amount || 0]));
  const charges = (byKind.VEHICLE_CHARGE || 0) + (byKind.WEIGHBRIDGE_CHARGE || 0) + (byKind.OTHER_CHARGE || 0);
  const payments = -(byKind.PAYMENT || 0);
  const credits = -(byKind.CREDIT || 0) - (byKind.REVERSAL || 0);
  return { charges, payments, credits, vehicleCharges: byKind.VEHICLE_CHARGE || 0, weighbridgeCharges: byKind.WEIGHBRIDGE_CHARGE || 0, otherCharges: byKind.OTHER_CHARGE || 0 };
}

publicRouter.get('/members', validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = { status: 'ACTIVE' };
  if (req.query.search) Object.assign(where, searchFilter(req.query.search, ['businessName', 'ownerName', 'memberId']));
  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({ where, orderBy: { businessName: 'asc' }, skip, take: limit }),
  ]);
  res.json({ members: members.map(publicMember), meta: pageMeta(total, page, limit) });
}));

publicRouter.get('/members/:memberId', asyncHandler(async (req, res) => {
  const m = await prisma.member.findFirst({ where: { memberId: req.params.memberId, status: 'ACTIVE' } });
  if (!m) throw notFound('Member not found');
  const summary = await balanceSummary(m.id);
  res.json({ member: publicMember(m), summary, lastUpdated: m.updatedAt });
}));

publicRouter.get('/outstanding', validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const where = { status: 'ACTIVE' };
  if (req.query.search) Object.assign(where, searchFilter(req.query.search, ['businessName', 'ownerName', 'memberId']));
  const [total, members] = await Promise.all([
    prisma.member.count({ where }),
    prisma.member.findMany({ where, orderBy: { outstandingBalance: 'desc' }, skip, take: limit }),
  ]);
  const rows = [];
  for (const m of members) {
    rows.push({ ...publicMember(m), summary: await balanceSummary(m.id) });
  }
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

publicRouter.get('/notices', asyncHandler(async (_req, res) => {
  const notices = await prisma.notice.findMany({ where: { isPublished: true }, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], take: 50 });
  res.json({ notices: notices.map((n) => ({ ...n, _id: n.id })) });
}));

const SAFE_SETTING_KEYS = ['orgName', 'orgNameBn', 'tagline', 'taglineBn', 'about', 'aboutBn'];
publicRouter.get('/settings', asyncHandler(async (_req, res) => {
  const docs = await prisma.siteSetting.findMany({ where: { key: { in: SAFE_SETTING_KEYS } } });
  res.json({ settings: Object.fromEntries(docs.map((d) => [d.key, d.value])) });
}));
