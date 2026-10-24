import express from 'express';
import { Member } from '../models/Member.js';
import { VehicleEntry, WeighbridgeEntry } from '../models/Entries.js';
import { Payment, Expense } from '../models/Payments.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/errorHandler.js';
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
    if (query.from) f[field].$gte = new Date(query.from);
    if (query.to) f[field].$lte = new Date(query.to);
  }
  return f;
}

async function resolveMember(memberId) {
  if (!memberId) return null;
  return Member.findOne({ memberId });
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

reportsRouter.get('/vehicles', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const filter = { ...rangeFilter(req.query, 'entryDate'), ...(member ? { member: member._id } : {}) };
  const rows = await VehicleEntry.find(filter).populate('member', 'memberId businessName').sort({ entryDate: 1 });
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const csvRows = rows.map((r) => ({ date: r.entryDate.toISOString().slice(0, 10), memberId: r.member?.memberId, business: r.member?.businessName, quantity: r.quantity, feePerVehicle: r.feePerVehicle, total: r.total }));
  return sendReport(res, req.query.format, 'vehicle-report.csv', ['date', 'memberId', 'business', 'quantity', 'feePerVehicle', 'total'], csvRows, { rows, totals: { count: rows.length, totalQty, totalAmount } });
}));

reportsRouter.get('/weighbridge', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery.extend({ category: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const filter = { ...rangeFilter(req.query, 'occurredAt'), ...(member ? { member: member._id } : {}) };
  if (req.query.category) filter.category = req.query.category;
  const rows = await WeighbridgeEntry.find(filter).populate('member', 'memberId businessName').sort({ occurredAt: 1 });
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] || 0) + r.fee;
  const csvRows = rows.map((r) => ({ date: r.occurredAt.toISOString().slice(0, 10), memberId: r.member?.memberId, category: r.category, fee: r.fee, referenceNumber: r.referenceNumber }));
  return sendReport(res, req.query.format, 'weighbridge-report.csv', ['date', 'memberId', 'category', 'fee', 'referenceNumber'], csvRows, { rows, byCategory, total: rows.reduce((s, r) => s + r.fee, 0) });
}));

reportsRouter.get('/outstanding', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const members = await Member.find({ status: 'ACTIVE' }).sort({ outstandingBalance: -1 });
  const csvRows = members.map((m) => ({ memberId: m.memberId, business: m.businessName, owner: m.ownerName, outstanding: m.outstandingBalance }));
  return sendReport(res, req.query.format, 'outstanding-report.csv', ['memberId', 'business', 'owner', 'outstanding'], csvRows, { rows: members, total: members.reduce((s, m) => s + m.outstandingBalance, 0) });
}));

reportsRouter.get('/payments', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery.extend({ method: z.string().optional() }) }), asyncHandler(async (req, res) => {
  const member = await resolveMember(req.query.memberId);
  const filter = { ...rangeFilter(req.query, 'paidAt'), ...(member ? { member: member._id } : {}) };
  if (req.query.method) filter.method = req.query.method;
  const rows = await Payment.find(filter).populate('member', 'memberId businessName').sort({ paidAt: 1 });
  const csvRows = rows.map((r) => ({ date: r.paidAt.toISOString().slice(0, 10), memberId: r.member?.memberId, receiptNumber: r.receiptNumber, method: r.method, amount: r.amount, status: r.status }));
  return sendReport(res, req.query.format, 'payment-report.csv', ['date', 'memberId', 'receiptNumber', 'method', 'amount', 'status'], csvRows, { rows, total: rows.reduce((s, r) => s + (r.status === 'POSTED' ? r.amount : 0), 0) });
}));

reportsRouter.get('/income-expense', requireAuth, requirePermission('reports:read'), validate({ query: rangeQuery }), asyncHandler(async (req, res) => {
  const charges = await LedgerEntry.aggregate([
    { $match: { kind: { $in: ['VEHICLE_CHARGE', 'WEIGHBRIDGE_CHARGE', 'OTHER_CHARGE'] }, ...rangeFilter(req.query, 'occurredAt') } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const payments = await Payment.aggregate([
    { $match: { status: 'POSTED', ...rangeFilter(req.query, 'paidAt') } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const expenses = await Expense.aggregate([
    { $match: rangeFilter(req.query, 'spentAt') },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  res.json({ income: charges[0]?.total || 0, paymentsCollected: payments[0]?.total || 0, expenses: expenses[0]?.total || 0 });
}));
