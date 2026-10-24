import express from 'express';
import { z } from 'zod';
import { FeeRule } from '../models/FeeRule.js';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notFound } from '../utils/errors.js';
import { audit } from '../services/ledgerService.js';

export const feeRulesRouter = express.Router();

feeRulesRouter.get('/', requireAuth, requirePermission('fees:read'), asyncHandler(async (_req, res) => {
  const rules = await FeeRule.find({}).sort({ category: 1, key: 1 });
  res.json({ rules });
}));

// Changing a fee NEVER rewrites history: charges store a fee snapshot.
feeRulesRouter.patch('/:id', requireAuth, requireRole('SUPER_ADMIN'), validate({ body: z.object({ amount: z.number().int().min(0) }) }), asyncHandler(async (req, res) => {
  const rule = await FeeRule.findByIdAndUpdate(req.params.id, { $set: { amount: req.body.amount } }, { new: true });
  if (!rule) throw notFound('Fee rule not found');
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'fee.update', entity: 'FeeRule', entityId: rule.key, details: { amount: rule.amount }, ipAddress: req.ip });
  res.json({ rule });
}));
