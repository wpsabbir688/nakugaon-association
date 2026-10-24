import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Expense } from '../models/Payments.js';
import { JournalEntry } from '../models/Account.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/ledgerService.js';

export const expensesRouter = express.Router();

expensesRouter.get('/', requireAuth, requirePermission('expenses:read'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    Expense.countDocuments({}),
    Expense.find({}).sort({ spentAt: -1 }).skip(skip).limit(limit),
  ]);
  res.json({ rows, meta: pageMeta(total, page, limit) });
}));

expensesRouter.post('/', requireAuth, requirePermission('expenses:write'), validate({ body: z.object({ title: z.string().min(1).max(200), amount: z.number().int().min(1), spentAt: z.string().min(1), method: z.enum(['CASH', 'BANK', 'OTHER']).optional().default('CASH'), category: z.string().max(100).optional().default(''), notes: z.string().max(1000).optional().default('') }) }), asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  let expense;
  try {
    await session.withTransaction(async () => {
      const [doc] = await Expense.create([{ ...req.body, spentAt: new Date(req.body.spentAt), recordedBy: req.user._id }], { session });
      await JournalEntry.create([{
        description: `Expense: ${req.body.title}`,
        lines: [
          { accountCode: 'EXPENSE', debit: req.body.amount, credit: 0 },
          { accountCode: req.body.method === 'BANK' ? 'BANK' : 'CASH', debit: 0, credit: req.body.amount },
        ],
        referenceType: 'Expense', referenceId: doc._id, recordedBy: req.user._id,
      }], { session });
      expense = doc;
    });
  } finally {
    await session.endSession();
  }
  await audit({ actor: req.user._id, actorName: req.user.name, action: 'expense.create', entity: 'Expense', entityId: expense._id.toString(), details: { amount: req.body.amount }, ipAddress: req.ip });
  res.status(201).json({ expense });
}));
