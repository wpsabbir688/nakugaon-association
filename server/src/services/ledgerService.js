import { prisma } from '../config/db.js';
import { badRequest } from '../utils/errors.js';

// `tx` is either the shared prisma client (single writes) or a Prisma
// transaction client (multi-write financial operations). Callers inside a
// transaction pass their tx; everything else defaults to prisma.
export async function audit({ actor, actorName, action, entity, entityId, details, ipAddress, tx }) {
  const db = tx || prisma;
  await db.auditLog.create({
    data: { actorId: actor || null, actorName: actorName || 'system', action, entity: entity || '', entityId: entityId || '', details: details || {}, ipAddress: ipAddress || '' },
  });
}

// Recompute a member's balance purely from ledger rows + opening balance.
export async function computeBalance(memberId, tx = null) {
  const db = tx || prisma;
  const member = await db.member.findUnique({ where: { id: memberId } });
  if (!member) throw badRequest('Member not found');
  const agg = await db.ledgerEntry.aggregate({ where: { memberId: member.id }, _sum: { amount: true } });
  return member.openingBalance + (agg._sum.amount || 0);
}

// Post a balanced journal entry (debits must equal credits).
export async function postJournal({ description, lines, referenceType, referenceId, recordedBy, tx }) {
  const db = tx || prisma;
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (debit !== credit || debit <= 0) throw badRequest('Journal entry must balance with positive totals');
  return db.journalEntry.create({
    data: { description, lines, referenceType: referenceType || '', referenceId: referenceId || null, recordedById: recordedBy || null },
  });
}

// Append a ledger row and transactionally refresh the member's cached balance.
// Callers run this inside a Prisma interactive transaction.
export async function appendLedger({ memberId, kind, amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, tx }) {
  const db = tx || prisma;
  const balance = await computeBalance(memberId, db);
  const runningBalance = balance + amount;
  const entry = await db.ledgerEntry.create({
    data: {
      memberId, kind, amount, runningBalance,
      reference: reference || '', referenceType: referenceType || '',
      referenceId: referenceId || null, idempotencyKey: idempotencyKey || null,
      recordedById: recordedBy || null, occurredAt: occurredAt || new Date(),
    },
  });
  await db.member.update({ where: { id: memberId }, data: { outstandingBalance: runningBalance } });
  return entry;
}

// Post a charge: ledger row + balanced journal (Dr Receivable / Cr Fee Income).
export async function postCharge({ memberId, kind, amount, reference, referenceType, referenceId, incomeAccount, recordedBy, occurredAt, idempotencyKey, tx }) {
  const db = tx || prisma;
  const ledger = await appendLedger({ memberId, kind, amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, tx: db });
  await postJournal({
    description: `${kind} ${reference || ''}`.trim(),
    lines: [
      { accountCode: 'RECEIVABLE', debit: amount, credit: 0 },
      { accountCode: incomeAccount, debit: 0, credit: amount },
    ],
    referenceType, referenceId, recordedBy, tx: db,
  });
  return ledger;
}

// Post a payment: ledger row (negative) + journal (Dr Cash/Bank / Cr Receivable)
// + FIFO allocation records against the oldest outstanding charge rows.
export async function postPayment({ memberId, amount, reference, referenceType, referenceId, method, recordedBy, occurredAt, idempotencyKey, tx }) {
  const db = tx || prisma;
  const ledger = await appendLedger({ memberId, kind: 'PAYMENT', amount: -amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, tx: db });
  await postJournal({
    description: `Payment ${reference || ''}`.trim(),
    lines: [
      { accountCode: method === 'BANK' ? 'BANK' : 'CASH', debit: amount, credit: 0 },
      { accountCode: 'RECEIVABLE', debit: 0, credit: amount },
    ],
    referenceType, referenceId, recordedBy, tx: db,
  });
  // FIFO allocation (informational; ledger is authoritative).
  const charges = await db.ledgerEntry.findMany({
    where: { memberId, kind: { in: ['VEHICLE_CHARGE', 'WEIGHBRIDGE_CHARGE', 'OTHER_CHARGE', 'OPENING'] }, amount: { gt: 0 } },
    orderBy: { occurredAt: 'asc' },
  });
  let remaining = amount;
  for (const charge of charges) {
    if (remaining <= 0) break;
    const allocated = await db.paymentAllocation.aggregate({ where: { ledgerEntryId: charge.id }, _sum: { amount: true } });
    const unpaid = charge.amount - (allocated._sum.amount || 0);
    if (unpaid <= 0) continue;
    const take = Math.min(unpaid, remaining);
    // Allocation rows are informational and link to a Payment record. Direct
    // ledger postings (e.g. the demo seed) carry no payment id, so they skip
    // allocations; the ledger row remains the authoritative record.
    if (referenceId) {
      await db.paymentAllocation.create({ data: { paymentId: referenceId, ledgerEntryId: charge.id, amount: take } });
    }
    remaining -= take;
  }
  return ledger;
}

// Reverse a posted ledger row with an authorized reversal transaction.
// Never silently deletes: creates a negating row + reversing journal entry.
export async function reverseLedger({ ledgerId, reason, recordedBy, tx }) {
  const db = tx || prisma;
  if (!ledgerId) throw badRequest('Ledger entry not found');
  const original = await db.ledgerEntry.findUnique({ where: { id: ledgerId } });
  if (!original) throw badRequest('Ledger entry not found');
  if (original.kind === 'REVERSAL') throw badRequest('A reversal cannot be reversed');
  const existing = await db.ledgerEntry.findFirst({ where: { reversalOfId: ledgerId } });
  if (existing) throw badRequest('This entry was already reversed');
  const reversal = await appendLedger({
    memberId: original.memberId, kind: 'REVERSAL', amount: -original.amount,
    reference: `REV-${original.reference || original.id}`, referenceType: original.referenceType,
    referenceId: original.referenceId, recordedBy, tx: db,
  });
  await db.ledgerEntry.update({ where: { id: reversal.id }, data: { reversalOfId: original.id, reversalReason: reason } });
  // Mirror the original journal entry (swap debit/credit per line) so the
  // books stay balanced. Opening rows have no journal entry — nothing to mirror.
  const originalJournal = await db.journalEntry.findFirst({
    where: { referenceType: original.referenceType, referenceId: original.referenceId },
  });
  if (originalJournal) {
    const lines = (Array.isArray(originalJournal.lines) ? originalJournal.lines : []).map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit }));
    await db.journalEntry.create({
      data: {
        description: `Reversal of ${original.kind} ${original.reference || ''} — ${reason}`.trim(),
        lines, referenceType: original.referenceType, referenceId: original.referenceId,
        reversalOfId: originalJournal.id, recordedById: recordedBy || null,
      },
    });
  }
  return { ...reversal, reversalOfId: original.id, reversalReason: reason };
}

// Recompute every member's cached balance from its ledger (admin maintenance).
export async function reconcileAll() {
  const members = await prisma.member.findMany({});
  let fixed = 0;
  for (const m of members) {
    const real = await computeBalance(m.id);
    if (real !== m.outstandingBalance) {
      await prisma.member.update({ where: { id: m.id }, data: { outstandingBalance: real } });
      fixed += 1;
    }
  }
  return { checked: members.length, fixed };
}
