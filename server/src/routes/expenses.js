import express from 'express';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate, paginationQuery, paginate, pageMeta } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { audit } from '../services/ledgerService.js';
import { withId, withIdList } from '../utils/serialize.js';

export const expensesRouter = express.Router();

expensesRouter.get('/', requireAuth, requirePermission('expenses:read'), validate({ query: paginationQuery }), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [total, rows] = await Promise.all([
    prisma.expense.count({}),
    prisma.expense.findMany({ orderBy: { spentAt: 'desc' }, skip, take: limit }),
  ]);
  res.json({ rows: withIdList(rows), meta: pageMeta(total, page, limit) });
}));

expensesRouter.post('/', requireAuth, requirePermission('expenses:write'), validate({ body: z.object({ title: z.string().min(1).max(200), amount: z.number().int().min(1), spentAt: z.string().min(1), method: z.enum(['CASH', 'BANK', 'OTHER']).optional().default('CASH'), category: z.string().max(100).optional().default(''), notes: z.string().max(1000).optional().default('') }) }), asyncHandler(async (req, res) => {
  const expense = await prisma.$transaction(async (tx) => {
    const doc = await tx.expense.create({ data: { ...req.body, spentAt: new Date(req.body.spentAt), recordedById: req.user.id } });
    await tx.journalEntry.create({
      data: {
        description: `Expense: ${req.body.title}`,
        lines: [
          { accountCode: 'EXPENSE', debit: req.body.amount, credit: 0 },
          { accountCode: req.body.method === 'BANK' ? 'BANK' : 'CASH', debit: 0, credit: req.body.amount },
        ],
        referenceType: 'Expense', referenceId: doc.id, recordedById: req.user.id,
      },
    });
    return doc;
  });
  await audit({ actor: req.user.id, actorName: req.user.name, action: 'expense.create', entity: 'Expense', entityId: expense.id, details: { amount: req.body.amount }, ipAddress: req.ip });
  res.status(201).json({ expense: withId(expense) });
}));
