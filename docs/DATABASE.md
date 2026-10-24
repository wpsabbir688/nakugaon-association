# Database design

## Connection & replica set

MongoDB 8.x via Mongoose. A single-node replica set (`rs0`) is required in
every environment, including local dev, because charge/payment posting uses
multi-document transactions. Without a replica set, transactions are rejected
by MongoDB — the server fails those writes loudly rather than half-posting.

Databases: `nakugaon` (dev), `nakugaon_test` (test suite, recreated per run),
`<Atlas database>` (production, see `DEPLOYMENT.md`).

## Core models

| Model | Purpose |
|---|---|
| `User` | Login accounts: email (unique), bcrypt hash, role, optional link to a Member, refresh-token hash, reset-token hash + expiry, `isActive` |
| `Member` | `memberId` (NAK-####, unique), businessName, ownerName, phone, address, father's name, notes, joiningDate, status (ACTIVE/ARCHIVED), `openingBalance`, `outstandingBalance` (cache), profileImageUrl |
| `Counter` | Atomic sequences: member IDs, per-day receipt numbers |
| `FeeRule` | key, label, category (VEHICLE/WEIGHBRIDGE), amount (integer ৳), `isActive` |
| `Account` | Chart of accounts (seeded): Receivable, Fee Income, Cash, Bank, Expense |
| `JournalEntry` | Balanced double-entry record: header + debit/credit lines, reference to the source document, reversal link |
| `LedgerEntry` | Per-member statement row: kind (VEHICLE_CHARGE, WEIGHBRIDGE_CHARGE, PAYMENT, CREDIT, REVERSAL, …), amount (signed integer ৳), `runningBalance`, reference, source document id |
| `VehicleEntry` | member, entryDate, quantity, `feePerVehicle` snapshot, total |
| `WeighbridgeEntry` | member, occurredAt, category, `fee` snapshot, weightKg, referenceNumber, operator |
| `Payment` | member, amount, method, paidAt, receiptNumber, status (POSTED/REVERSED), reversal reason |
| `PaymentAllocation` | FIFO allocation of a payment across open charges (informational — balances are computed from ledger rows, not from allocations) |
| `Expense` | title, amount, category, method, spentAt, status |
| `Notice` | title, body, `isPublished`, publishedAt |
| `SiteSetting` | Single document: org names, taglines, about text — contact/registration fields stay empty until confirmed |
| `AuditLog` | actor, actorName, action, entity, entityId, IP, before/after snapshot where relevant |

## Ledger model (implemented — read carefully)

- **Money is integer Taka everywhere.** No floats in any money path.
- **Ledger rows are the source of truth.** `Outstanding = Opening + Posted
  Charges − Payments − Approved Credits`, computed from ledger rows.
- **Member `outstandingBalance` is a cache**, updated inside the same
  transaction as the ledger row. `GET /members/:memberId/balance` reports
  cached vs computed values and an `inSync` flag; `POST
  /members/:memberId/reconcile` (ACCOUNTANT+) rebuilds the cache from the
  ledger. Any drift is therefore detectable and repairable.
- **Double-entry journals are real but scoped.** Every charge, payment,
  expense, and reversal writes a balanced `JournalEntry` (debits = credits)
  alongside its ledger row:
  - Charge: Dr Receivable / Cr Fee Income
  - Payment: Dr Cash/Bank / Cr Receivable
  - Expense: Dr Expense / Cr Cash/Bank
  - Reversal: mirror journal + negating ledger row; the original is marked
    REVERSED, never deleted.
- **This is not a full ERP accounting system.** There is no trial balance,
  profit-and-loss statement, or tax reporting — only the journal records and
  the reports listed in `API.md`. Do not describe it as full double-entry
  compliance beyond what is implemented here.
- **Overpayment is a credit balance** (negative outstanding), never silently
  discarded or auto-refunded. Refunds, if ever offered, would be explicit
  reversal/credit transactions.
- **Fee snapshots:** every vehicle/weighbridge charge stores the fee that
  applied at creation. Changing a fee rule affects future charges only —
  history is never rewritten.
- **Idempotency:** vehicle, weighbridge, and payment creates accept
  `idempotencyKey` (unique + sparse index). Replaying a key returns the
  original document — safe retries cannot double-charge.
- **Deletes:** financial documents are never hard-deleted. Members are
  archived, payments are reversed, and everything is audit-logged.
