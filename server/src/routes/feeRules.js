import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/ledgerService.js';
import { withId, withIdList } from '../utils/serialize.js';

export const feeRulesRouter = express.Router();

feeRulesRouter.get('/', requireAuth, requirePermission('fees:read'), asyncHandler(async (_req, res) => {
  const rules = await prisma.feeRule.findMany({ orderBy: [{ category: 'asc' }, { key: 'asc' }] });
  res.json({ rules: withIdList(rules) });
}));

// Changing a fee NEVER rewrites history: charges store a fee snapshot.
feeRulesRouter.patch('/:id', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ amount: z.number().int().min(0) }) }), asyncHandler(async (req, res) => {
  let rule;
  try {
    rule = await prisma.feeRule.update({ where: { id: req.params.id }, data: { amount: req.body.amount } });
  } catch (err) {
    if (err?.code === 'P2025') throw notFound('Fee rule not found');
    throw err;
  }
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'fee.update', entity: 'FeeRule', entityId: rule.key, details: { amount: rule.amount }, ipAddress: req.ip });
  res.json({ rule: withId(rule) });
}));
