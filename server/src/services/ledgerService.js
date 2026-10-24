import mongoose from 'mongoose';
import { Member } from '../models/Member.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { JournalEntry } from '../models/Account.js';
import { AuditLog } from '../models/Misc.js';
import { badRequest } from '../utils/errors.js';

export async function audit({ actor, actorName, action, entity, entityId, details, ipAddress, session }) {
  await AuditLog.create(
    [{ actor: actor || null, actorName: actorName || 'system', action, entity: entity || '', entityId: entityId || '', details: details || {}, ipAddress: ipAddress || '' }],
    { session: session || null }
  );
}

// Recompute a member's balance purely from ledger rows + opening balance.
export async function computeBalance(memberId, session = null) {
  const member = await Member.findById(memberId).session(session);
  if (!member) throw badRequest('Member not found');
  const agg = await LedgerEntry.aggregate([
    { $match: { member: member._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session);
  return member.openingBalance + (agg[0]?.total || 0);
}

// Post a balanced journal entry (debits must equal credits).
export async function postJournal({ description, lines, referenceType, referenceId, recordedBy, session }) {
  const debit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (debit !== credit || debit <= 0) throw badRequest('Journal entry must balance with positive totals');
  const [entry] = await JournalEntry.create(
    [{ description, lines, referenceType: referenceType || '', referenceId: referenceId || null, recordedBy: recordedBy || null }],
    { session }
  );
  return entry;
}

// Append a ledger row and transactionally refresh the member's cached balance.
// Callers run this inside a mongoose session transaction.
export async function appendLedger({ memberId, kind, amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, session }) {
  const balance = await computeBalance(memberId, session);
  const runningBalance = balance + amount;
  const [entry] = await LedgerEntry.create(
    [{
      member: memberId, kind, amount, runningBalance,
      reference: reference || '', referenceType: referenceType || '',
      referenceId: referenceId || null, idempotencyKey: idempotencyKey || null,
      recordedBy: recordedBy || null, occurredAt: occurredAt || new Date(),
    }],
    { session }
  );
  await Member.updateOne({ _id: memberId }, { $set: { outstandingBalance: runningBalance } }, { session });
  return entry;
}

// Post a charge: ledger row + balanced journal (Dr Receivable / Cr Fee Income).
export async function postCharge({ memberId, kind, amount, reference, referenceType, referenceId, incomeAccount, recordedBy, occurredAt, idempotencyKey, session }) {
  const ledger = await appendLedger({ memberId, kind, amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, session });
  await postJournal({
    description: `${kind} ${reference || ''}`.trim(),
    lines: [
      { accountCode: 'RECEIVABLE', debit: amount, credit: 0 },
      { accountCode: incomeAccount, debit: 0, credit: amount },
    ],
    referenceType, referenceId, recordedBy, session,
  });
  return ledger;
}

// Post a payment: ledger row (negative) + journal (Dr Cash/Bank / Cr Receivable)
// + FIFO allocation records against the oldest outstanding charge rows.
export async function postPayment({ memberId, amount, reference, referenceType, referenceId, method, recordedBy, occurredAt, idempotencyKey, session }) {
  const ledger = await appendLedger({ memberId, kind: 'PAYMENT', amount: -amount, reference, referenceType, referenceId, idempotencyKey, recordedBy, occurredAt, session });
  await postJournal({
    description: `Payment ${reference || ''}`.trim(),
    lines: [
      { accountCode: method === 'BANK' ? 'BANK' : 'CASH', debit: amount, credit: 0 },
      { accountCode: 'RECEIVABLE', debit: 0, credit: amount },
    ],
    referenceType, referenceId, recordedBy, session,
  });
  // FIFO allocation (informational; ledger is authoritative).
  const charges = await LedgerEntry.find({
    member: memberId,
    kind: { $in: ['VEHICLE_CHARGE', 'WEIGHBRIDGE_CHARGE', 'OTHER_CHARGE', 'OPENING'] },
    amount: { $gt: 0 },
  }).sort({ occurredAt: 1 }).session(session);
  let remaining = amount;
  const { PaymentAllocation } = await import('../models/Payments.js');
  for (const charge of charges) {
    if (remaining <= 0) break;
    const allocated = await PaymentAllocation.aggregate([
      { $match: { ledgerEntry: charge._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).session(session);
    const unpaid = charge.amount - (allocated[0]?.total || 0);
    if (unpaid <= 0) continue;
    const take = Math.min(unpaid, remaining);
    await PaymentAllocation.create([{ payment: referenceId, ledgerEntry: charge._id, amount: take }], { session });
    remaining -= take;
  }
  return ledger;
}

// Reverse a posted ledger row with an authorized reversal transaction.
// Never silently deletes: creates a negating row + reversing journal entry.
export async function reverseLedger({ ledgerId, reason, recordedBy, session }) {
  const original = await LedgerEntry.findById(ledgerId).session(session);
  if (!original) throw badRequest('Ledger entry not found');
  if (original.kind === 'REVERSAL') throw badRequest('A reversal cannot be reversed');
  const existing = await LedgerEntry.findOne({ reversalOf: ledgerId }).session(session);
  if (existing) throw badRequest('This entry was already reversed');
  const reversal = await appendLedger({
    memberId: original.member, kind: 'REVERSAL', amount: -original.amount,
    reference: `REV-${original.reference || original._id}`, referenceType: original.referenceType,
    referenceId: original.referenceId, recordedBy, session,
  });
  reversal.reversalOf = original._id;
  reversal.reversalReason = reason;
  await reversal.save({ session });
  // Mirror the original journal entry (swap debit/credit per line) so the
  // books stay balanced. Opening rows have no journal entry — nothing to mirror.
  const originalJournal = await JournalEntry.findOne({
    referenceType: original.referenceType, referenceId: original.referenceId,
  }).session(session);
  if (originalJournal) {
    const [mirror] = await JournalEntry.create(
      [{
        description: `Reversal of ${original.kind} ${original.reference || ''} — ${reason}`.trim(),
        lines: originalJournal.lines.map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit })),
        referenceType: original.referenceType, referenceId: original.referenceId,
        reversalOf: originalJournal._id, recordedBy: recordedBy || null,
      }],
      { session }
    );
    void mirror;
  }
  return reversal;
}

// Recompute every member's cached balance from its ledger (admin maintenance).
export async function reconcileAll() {
  const members = await Member.find({});
  let fixed = 0;
  for (const m of members) {
    const real = await computeBalance(m._id);
    if (real !== m.outstandingBalance) {
      m.outstandingBalance = real;
      await m.save();
      fixed += 1;
    }
  }
  return { checked: members.length, fixed };
}
