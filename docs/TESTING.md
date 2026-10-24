# Testing

## Server suite (executed — green)

```bash
cd server && npm test   # vitest + supertest against nakugaon_test (PostgreSQL)
```

**Result at last run (2026-10-24, after the MongoDB → PostgreSQL port):
18/18 tests pass.**

Coverage, mapped to the brief's required checks:

| # | Check | Result |
|---|---|---|
| 1 | Member-ID uniqueness (sequential NAK-0001, NAK-0002, …) | ✅ pass |
| 2 | Vehicle fee math (4 × ৳50 = ৳200, exactly one ledger row) | ✅ pass |
| 3 | All 4 weighbridge categories (Bhutan ৳100, Bangladeshi ৳200, Lorry/crab ৳100, Trolley ৳300) | ✅ pass |
| 4 | Payment/balance math (partial payment reduces balance exactly) | ✅ pass |
| 5 | Overpayment → negative (credit) balance (−৳450 in the test) | ✅ pass |
| 6 | Duplicate prevention (same idempotency key returns the original) | ✅ pass |
| 7 | Rollback (failed entry leaves no partial documents) | ✅ pass |
| 8 | Historical fee preservation (fee-rule change does not rewrite old charges) | ✅ pass |
| 9 | Reversal (single reversal restores the prior balance; original marked REVERSED) | ✅ pass |
| 10 | RBAC (operator cannot record payments; member cannot read another member) | ✅ pass |
| 11 | Public visibility (public endpoints omit phone/address/notes/passwords) | ✅ pass |
| 12 | Unauthorized rejection (no token / wrong role → 401/403) | ✅ pass |
| 13 | Validation (bad payloads → 400, no documents created) | ✅ pass |
| 14 | Receipt math (unique `REC-YYYYMMDD-####`, previous/remaining balance on response) | ✅ pass |
| 15 | Dashboard consistency (dashboard totals match direct aggregation) | ✅ pass |

One real bug was found and fixed by this suite: MEMBER users initially got
403 on their own ledger because the role lacked the `ledger:read` permission
— fixed by granting it with server-side scoping to the member's own record.

**PostgreSQL port (2026-10-24):** the suite was ported from Mongoose to
Prisma and re-run green (18/18) against a local Postgres test database. One
further real bug surfaced in the demo-seed smoke test: FIFO payment
allocations require a Payment record id, but direct ledger postings (the
seed posts charges/payments without Payment rows) carry none — allocations
are now skipped when no payment id exists (they are informational only; the
ledger row remains authoritative). Tests were re-run green after the fix.

## Client checks (executed)

- **Production build:** `cd client && npm run build` — passes (Vite 6).
- **Dictionary parity:** bn/en key sets compared programmatically — 56/56
  identical, so no UI string renders untranslated for a missing key.
- **Route smoke test:** production build served via `vite preview`; `/bn`
  and `/en/members` both return HTTP 200 with the correct page shell/title.

## Not run (stated, not claimed)

- **Playwright / browser E2E:** not run — no browser automation is available
  in this environment. UI flows (login → create member → entry → payment →
  portal view) are exercised at the API level by the server suite, but no
  automated click-through test has executed.
- **Real-device / responsive check:** not performed. The layout uses
  responsive Tailwind classes, but no phone/tablet verification has run.
- **Load / concurrency testing:** not performed. Member IDs and receipt
  numbers use atomic counters, but high-concurrency behaviour is unmeasured.
