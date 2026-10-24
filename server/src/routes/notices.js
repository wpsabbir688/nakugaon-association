import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/ledgerService.js';
import { withId, withIdList } from '../utils/serialize.js';

export const noticesRouter = express.Router();

noticesRouter.get('/', requireAuth, requirePermission('notices:write'), asyncHandler(async (_req, res) => {
  const notices = await prisma.notice.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ notices: withIdList(notices) });
}));

noticesRouter.post('/', requireAuth, requirePermission('notices:write'), validate({ body: z.object({ title: z.string().min(1).max(200), body: z.string().min(1), language: z.enum(['bn', 'en', 'both']).optional().default('both'), isPublished: z.boolean().optional().default(false) }) }), asyncHandler(async (req, res) => {
  const notice = await prisma.notice.create({ data: { ...req.body, publishedAt: req.body.isPublished ? new Date() : null, createdById: req.user.id } });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'notice.create', entity: 'Notice', entityId: notice.id, ipAddress: req.ip });
  res.status(201).json({ notice: withId(notice) });
}));

noticesRouter.patch('/:id', requireAuth, requirePermission('notices:write'), validate({ body: z.object({ title: z.string().min(1).max(200).optional(), body: z.string().min(1).optional(), isPublished: z.boolean().optional() }) }), asyncHandler(async (req, res) => {
  let notice;
  try {
    notice = await prisma.notice.update({ where: { id: req.params.id }, data: { ...req.body, ...(req.body.isPublished ? { publishedAt: new Date() } : {}) } });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('Notice not found');
    throw err;
  }
  res.json({ notice: withId(notice) });
}));

export const settingsRouter = express.Router();

settingsRouter.get('/', requireAuth, requireRole('SUPER_ADMIN'), asyncHandler(async (_req, res) => {
  const docs = await prisma.siteSetting.findMany({});
  res.json({ settings: Object.fromEntries(docs.map((d) => [d.key, d.value])) });
}));

settingsRouter.put('/', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ settings: z.record(z.string(), z.any()) }) }), asyncHandler(async (req, res) => {
  for (const [key, value] of Object.entries(req.body.settings)) {
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'settings.update', entity: 'SiteSetting', ipAddress: req.ip });
  res.json({ ok: true });
}));

export const auditRouter = express.Router();

auditRouter.get('/', requireAuth, requireRole('SUPER_ADMIN'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({}),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
  ]);
  res.json({ rows: withIdList(rows), meta: pageMeta(total, page, limit) });
}));
