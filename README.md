# Nakugaon Import & Export Owners Association

Bilingual (Bengali + English) full-stack web application for the
**Nakugaon Import & Export Owners Association** / নাকুগাঁও আমদানি ও রপ্তানিকারক মালিক সমিতি.

It manages members, vehicle entries, weighbridge charges, payments, ledgers,
expenses, notices, and public outstanding balances — with a staff admin panel
and a member portal. Routes are `/bn/…` and `/en/…` with a language switcher.

## Stack

- **Frontend:** React 19 + Vite 6 + React Router 7 + Tailwind CSS v4 + Axios +
  React Hook Form + Zod + Lucide + Recharts (JavaScript / JSX only, no TypeScript)
- **Backend:** Node.js + Express (ES modules) + Prisma + PostgreSQL (Neon-compatible)
- **Auth:** JWT access token (15 min, memory only — never localStorage) +
  7-day HttpOnly refresh cookie with rotation + bcrypt password hashing
- **Tests:** Vitest + Supertest (server). Playwright E2E was **not** run — no
  browser automation is available in this environment (see "What is not verified").

## Quick start (local development)

Prerequisites: Node.js 20+, PostgreSQL 16 (local dev/test) — see
`docs/DATABASE.md` for the schema and transaction notes.

```bash
# 1. Install
npm run install:all

# 2. Configure
cp .env.example server/.env
# Edit server/.env: set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to long random strings.

# 3. Create the first admin (never use the demo seed for real data)
ADMIN_PASSWORD='<redacted>' node server/scripts/create-admin.js "Full Name" admin@example.com

# 4. Run (server :4001, client :5173 with /api proxy)
npm run dev
```

Open http://localhost:5173 — it redirects to `/bn`.

## Features

| Area | What is implemented |
|---|---|
| Public site | Home (real member count + published notices), member directory (search + pagination), public member profile, public outstanding list, notices, about, contact, privacy |
| Members | Server-generated sequential IDs (`NAK-0001`, …), CRUD, archive (never hard-deletes financial history), opening balance, photo upload |
| Vehicle entries | ৳50/vehicle, quantity × fee, fee snapshot, idempotency key, daily/monthly/yearly reporting |
| Weighbridge | Bhutan ৳100, Bangladeshi ৳200, Lorry/crab ৳100, Trolley ৳300 — editable fee rules that never rewrite history; each posting creates the record + ledger charge + balance update + audit event atomically |
| Payments | Cash/bank/other, FIFO allocation records, partial and full payments, overpayment becomes a credit balance, unique receipts (`REC-YYYYMMDD-####`), authorized reversal only (with reason, never silent delete) |
| Ledger & accounting | Integer Taka only (never floats for money). `Outstanding = Opening + Posted Charges − Payments − Approved Credits`. Ledger rows are the source of truth; member `outstandingBalance` is a transactionally maintained cache with an admin reconcile endpoint. Balanced double-entry journal entries are written for every charge, payment, expense, and reversal (Dr Receivable / Cr Fee Income, Dr Cash/Bank / Cr Receivable, Dr Expense / Cr Cash/Bank). |
| Admin dashboard | Real Postgres aggregates via API: active members, today's vehicles/charges/payments, total outstanding, 14-day vehicle trend, weighbridge by category, recent transactions (Recharts) |
| Reports | JSON + CSV (formula-injection protected): vehicles, weighbridge, payments, outstanding, income/expense |
| Member portal | Own profile, own ledger, own statement CSV — server-enforced scoping; a member can never read another member's data |
| Security | Helmet, restricted CORS, Zod validation, rate limits, parameterized case-insensitive search (injection-safe), 2 MB JPG/PNG/WebP uploads with random filenames, audit log, no stack traces in production responses |
| Roles | SUPER_ADMIN, MANAGER, ACCOUNTANT, OPERATOR, MEMBER, PUBLIC — enforced server-side, least privilege |

## Honesty notes — read before deploying

- **No invented official data.** Contact details, registration numbers, and
  statistics are intentionally empty in site settings until the association
  supplies and confirms them. The About/Contact pages say so explicitly.
- **Example figures are illustrative only.** The ৳1,500 / ৳700 example from the
  original brief never appears in production code paths; real fees come from the
  fee-rule table (vehicle ৳50, weighbridge ৳100/৳200/৳100/৳300 defaults).
- **Exports are CSV only.** Binary Excel (.xlsx) and PDF exports are **not**
  implemented; CSV opens in Excel and matches database records.
- **Uploads are local only.** An S3 driver is documented as future work, not
  implemented. Do not set `STORAGE_DRIVER=s3` — it is not wired up.
- **Email is logged-only.** Password-reset tokens are emailed only after SMTP
  is configured; until then they are written to the server log and never
  exposed through the API.
- **Demo seed is fictional.** `SEED_DEMO=true node server/scripts/seed.js`
  creates 6 demo members labelled "(Demo)" plus a demo admin
  `admin@nakugaon.local`. Never run it against real records.
- **Payment gateways: none.** Cash/bank recording only. No SSLCommerz, bKash,
  or Nagad integration is claimed or implemented.

## Project layout

```
client/   React frontend (src/pages/public, src/pages/admin, src/pages/member)
server/   Express API (src/routes, src/services, src/middleware, prisma/schema.prisma)
  scripts/  create-admin.js (real admins), seed.js (fictional demo data, gated)
docs/     INSTALL.md, API.md, DATABASE.md, TESTING.md, DEPLOYMENT.md
```

## Documentation

- [docs/INSTALL.md](docs/INSTALL.md) — install & run, incl. local PostgreSQL
- [docs/API.md](docs/API.md) — endpoint reference, roles, idempotency, receipts
- [docs/DATABASE.md](docs/DATABASE.md) — Prisma models, ledger/journal design, transaction notes
- [docs/TESTING.md](docs/TESTING.md) — what was run, actual results, what was not run
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production deployment (documentation only; nothing provisioned)

## License

Built for the Nakugaon Import & Export Owners Association. All rights reserved
unless the association decides otherwise.
