import express from 'express';
import { Member } from '../models/Member.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Notice } from '../models/Misc.js';
import { SiteSetting } from '../models/Misc.js';
import { paginationQuery, paginate, pageMeta, safeSearchRegex } from '../middleware/validate.js';
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

async function balanceSummary(memberId) {
  const rows = await LedgerEntry.aggregate([
    { $match: { member: memberId } },
    { $group: { _id: '$kind', total: { $sum: '$amount' } } },
  ]);
  const byKind = Object.fromEntries(rows.map((r) => [r._id, r.total]));
  const charges = (byKind.VEHICLE_CHARGE || 0) + (byKind.WEIGHBRIDGE_CHARGE || 0) + (byKind.OTHER_CHARGE || 0);
  const payments = -(byKind.PAYMENT || 0);
  const credits = -(byKind.CREDIT || 0) - (byKind.REVERSAL || 0);
  return { charges, payments, credits, vehicleCharges: byKind.VEHICLE_CHARGE || 0, weighbridgeCharges: byKind.WEIGHBRIDGE_CHARGE || 0, otherCharges: byKind.OTHER_CHARGE || 0 };
}

publicRouter.get('/members', validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { status: 'ACTIVE' };
  if (req.query.search) {
    const rx = safeSearchRegex(req.query.search);
    filter.$or = [{ businessName: rx }, { ownerName: rx }, { memberId: rx }];
  }
  const [total, members] = await Promise.all([
    Member.countDocuments(filter),
    Member.find(filter).sort({ businessName: 1 }).skip(skip).limit(limit),
  ]);
  res.json({ members: members.map(publicMember), meta: pageMeta(total, page, limit) });
}));

publicRouter.get('/members/:memberId', asyncHandler(async (req, res) => {
  const m = await Member.findOne({ memberId: req.params.memberId, status: 'ACTIVE' });
  if (!m) throw notFound('Member not found');
  const summary = await balanceSummary(m._id);
  res.json({ member: publicMember(m), summary, lastUpdated: m.updatedAt });
}));

publicRouter.get('/outstanding', validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { status: 'ACTIVE' };
  if (req.query.search) {
    const rx = safeSearchRegex(req.query.search);
    filter.$or = [{ businessName: rx }, { ownerName: rx }, { memberId: rx }];
  }
  const [total, members] = await Promise.all([
    Member.countDocuments(filter),
    Member.find(filter).sort({ outstandingBalance: -1 }).skip(skip).limit(limit),
  ]);
  const rows = [];
  for (const m of members) {
    rows.push({ ...publicMember(m), summary: await balanceSummary(m._id) });
  }
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

publicRouter.get('/notices', asyncHandler(async (_req, res) => {
  const notices = await Notice.find({ isPublished: true }).sort({ publishedAt: -1, createdAt: -1 }).limit(50);
  res.json({ notices });
}));

const SAFE_SETTING_KEYS = ['orgName', 'orgNameBn', 'tagline', 'taglineBn', 'about', 'aboutBn'];
publicRouter.get('/settings', asyncHandler(async (_req, res) => {
  const docs = await SiteSetting.find({ key: { $in: SAFE_SETTING_KEYS } });
  res.json({ settings: Object.fromEntries(docs.map((d) => [d.key, d.value])) });
}));
