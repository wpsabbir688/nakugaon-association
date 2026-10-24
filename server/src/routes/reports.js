import express from 'express';
import { prisma } from '../config/db.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { withId, withIdList, memberRef } from '../utils/serialize.js';
import { z } from 'zod';

export const reportsRouter = express.Router();

const rangeQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  memberId: z.string().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

function rangeFilter(query, field) {
  const f = {};
  if (query.from || query.to) {
    f[field] = {};
    if (query.from) f[field].gte = new Date(query.from);
    if (query.to) f[field].lte = new Date(query.to);
  }
  return f;
}

async function resolveMember(memberId) {
  if (!memberId) return null;
  return prisma.member.findUnique({ where: { memberId } });
}

// CSV helper with formula-injection protection (prefix risky leading chars).
export function toCsv(headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function sendReport(res, format, filename, headers, rows, json) {
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(toCsv(headers, rows));
  }
  return res.json(json);
}

const memberSelect = { select: { id: true, memberId: true, businessName: true, ownerName: true } };
function shapeRow(r) {
  const row = withId(r);
  row.member = memberRef(r.member);
  return row;
}

reportsRouter.get('/vehicles', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const where = { ...rangeFilter(req.query, 'entryDate'), ...(member ? { memberId: member.id } : {}) };
  const rows = await prisma.vehicleEntry.findMany({ where, include: { member: memberSelect }, orderBy: { entryDate: 'asc' } });
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const csvRows = rows.map((r) => ({ date: r.entryDate.toISOString().slice(0, 10), memberId: r.member?.memberId, business: r.member?.businessName, quantity: r.quantity, feePerVehicle: r.feePerVehicle, total: r.total }));
  return sendReport(res, req.query.format, 'vehicle-report.csv', ['date', 'memberId', 'business', 'quantity', 'feePerVehicle', 'total'], csvRows, { rows: rows.map(shapeRow), totals: { count: rows.length, totalQty, totalAmount } });
}));

reportsRouter.get('/weighbridge', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery.extend({ category: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const where = { ...rangeFilter(req.query, 'occurredAt'), ...(member ? { memberId: member.id } : {}) };
  if (req.query.category) where.category = req.query.category;
  const rows = await prisma.weighbridgeEntry.findMany({ where, include: { member: memberSelect }, orderBy: { occurredAt: 'asc' } });
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] || 0) + r.fee;
  const csvRows = rows.map((r) => ({ date: r.occurredAt.toISOString().slice(0, 10), memberId: r.member?.memberId, category: r.category, fee: r.fee, referenceNumber: r.referenceNumber }));
  return sendReport(res, req.query.format, 'weighbridge-report.csv', ['date', 'memberId', 'category', 'fee', 'referenceNumber'], csvRows, { rows: rows.map(shapeRow), byCategory, total: rows.reduce((s, r) => s + r.fee, 0) });
}));

reportsRouter.get('/outstanding', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const members = await prisma.member.findMany({ where: { status: 'ACTIVE' }, orderBy: { outstandingBalance: 'desc' } });
  const csvRows = members.map((m) => ({ memberId: m.memberId, business: m.businessName, owner: m.ownerName, outstanding: m.outstandingBalance }));
  return sendReport(res, req.query.format, 'outstanding-report.csv', ['memberId', 'business', 'owner', 'outstanding'], csvRows, { rows: withIdList(members), total: members.reduce((s, m) => s + m.outstandingBalance, 0) });
}));

reportsRouter.get('/payments', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery.extend({ method: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const where = { ...rangeFilter(req.query, 'paidAt'), ...(member ? { memberId: member.id } : {}) };
  if (req.query.method) where.method = req.query.method;
  const rows = await prisma.payment.findMany({ where, include: { member: memberSelect }, orderBy: { paidAt: 'asc' } });
  const csvRows = rows.map((r) => ({ date: r.paidAt.toISOString().slice(0, 10), memberId: r.member?.memberId, receiptNumber: r.receiptNumber, method: r.method, amount: r.amount, status: r.status }));
  return sendReport(res, req.query.format, 'payment-report.csv', ['date', 'memberId', 'receiptNumber', 'method', 'amount', 'status'], csvRows, { rows: rows.map(shapeRow), total: rows.reduce((s, r) => s + (r.status === 'POSTED' ? r.amount : 0), 0) });
}));

reportsRouter.get('/income-expense', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const charges = await prisma.ledgerEntry.aggregate({ where: { kind: { in: ['VEHICLE_CHARGE', 'WEIGHBRIDGE_CHARGE', 'OTHER_CHARGE'] }, ...rangeFilter(req.query, 'occurredAt') }, _sum: { amount: true } });
  const payments = await prisma.payment.aggregate({ where: { status: 'POSTED', ...rangeFilter(req.query, 'paidAt') }, _sum: { amount: true } });
  const expenses = await prisma.expense.aggregate({ where: rangeFilter(req.query, 'spentAt'), _sum: { amount: true } });
  res.json({ income: charges._sum.amount || 0, paymentsCollected: payments._sum.amount || 0, expenses: expenses._sum.amount || 0 });
}));
