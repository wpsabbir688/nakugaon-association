import express from 'express';
import { z } from 'zod';
import { Notice, SiteSetting, AuditLog } from '../models/Misc.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/ledgerService.js';

export const noticesRouter = express.Router();

noticesRouter.get('/', requireAuth, requirePermission('notices:write'), asyncHandler(async (_req, res) => {
  const notices = await Notice.find({}).sort({ createdAt: -1 }).limit(100);
  res.json({ notices });
}));

noticesRouter.post('/', requireAuth, requirePermission('notices:write'), validate({ body: z.object({ title: z.string().min(1).max(200), body: z.string().min(1), language: z.enum(['bn', 'en', 'both']).optional().default('both'), isPublished: z.boolean().optional().default(false) }) }), asyncHandler(async (req, res) => {
  const notice = await Notice.create({ ...req.body, publishedAt: req.body.isPublished ? new Date() : null, createdBy: req.user._id });
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'notice.create', entity: 'Notice', entityId: notice._id.toString(), ipAddress: req.ip });
  res.status(201).json({ notice });
}));

noticesRouter.patch('/:id', requireAuth, requirePermission('notices:write'), validate({ body: z.object({ title: z.string().min(1).max(200).optional(), body: z.string().min(1).optional(), isPublished: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndUpdate(req.params.id, { $set: { ...req.body, ...(req.body.isPublished ? { publishedAt: new Date() } : {}) } }, { new: true });
  if (!notice) throw notFound('Notice not found');
  res.json({ notice });
}));

export const settingsRouter = express.Router();

settingsRouter.get('/', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const docs = await SiteSetting.find({});
  res.json({ settings: Object.fromEntries(docs.map((d) => [d.key, d.value])) });
}));

settingsRouter.put('/', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ settings: z.record(z.string(), z.any()) }) }), asyncHandler(async (req, res) => {
  for (const [key, value] of Object.entries(req.body.settings)) {
    await SiteSetting.updateOne({ key }, { $set: { value } }, { upsert: true });
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'settings.update', entity: 'SiteSetting', ipAddress: req.ip });
  res.json({ ok: true });
}));

export const auditRouter = express.Router();

auditRouter.get('/', requireAuth, requireRole('SUPER_ADMIN'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    AuditLog.countDocuments({}),
    AuditLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));
