# API reference

Base path: `/api/v1`. All money is integer Bangladeshi Taka (৳). All timestamps
are ISO 8601. Error responses: `{ "error": { "code", "message" } }` — no stack
traces in production.

## Auth

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/auth/login` | PUBLIC | Returns access token (15 min) + sets HttpOnly refresh cookie (7 days) |
| POST | `/auth/refresh` | cookie | Rotates the refresh token |
| POST | `/auth/logout` | any | Clears the refresh cookie |
| GET | `/auth/me` | any | Returns user incl. `memberPublicId` (NAK id) for MEMBER users |
| POST | `/auth/request-reset` | PUBLIC | Always returns success; token emailed only if SMTP configured, otherwise logged |
| POST | `/auth/reset-password` | PUBLIC | Hashed token, 1-hour expiry |

Access tokens live in memory only on the client — never in localStorage.

## Public (no login)

Only approved fields are returned: `memberId, businessName, ownerName,
profileImageUrl, status, joiningDate, outstandingBalance, updatedAt` plus a
balance summary. Phone, address, father's name, notes, and audit logs are never
returned here.

| Method | Path | Notes |
|---|---|---|
| GET | `/public/members?search=&page=&limit=` | Search regex is escaped |
| GET | `/public/members/:memberId` | Profile + balance summary |
| GET | `/public/outstanding?search=&page=&limit=` | Sorted by outstanding desc |
| GET | `/public/notices` | Published notices only |
| GET | `/public/settings` | Public site settings only |

## Members (staff + scoped member)

| Method | Path | Role |
|---|---|---|
| GET | `/members` | staff; MEMBER forced to own record only |
| POST | `/members` | MANAGER, SUPER_ADMIN |
| GET | `/members/:memberId` | staff; MEMBER own record only |
| PATCH | `/members/:memberId` | MANAGER, SUPER_ADMIN |
| POST | `/members/:memberId/archive` | SUPER_ADMIN — status ARCHIVED, history preserved (status can be set back to ACTIVE via PATCH) |
| POST | `/members/:memberId/photo` | MANAGER, SUPER_ADMIN — JPG/PNG/WebP, max 2 MB |
| GET | `/members/:memberId/ledger` | staff; MEMBER own ledger only |
| GET | `/members/:memberId/balance` | staff — cached vs computed balance + in-sync flag |
| POST | `/members/:memberId/reconcile` | ACCOUNTANT, SUPER_ADMIN — rebuilds cached balance from ledger |

Member IDs are server-generated sequential `NAK-0001`, `NAK-0002`, … via an
atomic counter document. Clients cannot choose IDs.

## Vehicles / weighbridge / payments

All three `POST` endpoints accept an optional `idempotencyKey`. Replaying the
same key returns the original record instead of creating a duplicate.

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/vehicles` | OPERATOR+ | quantity × ৳50 (fee snapshot stored) |
| GET | `/vehicles` | staff | Filters: member, from, to, month, year |
| POST | `/weighbridge` | OPERATOR+ | Category fee snapshot stored |
| GET | `/weighbridge` | staff | Filters: member, category, from, to |
| GET | `/weighbridge/categories` | staff | Current fee rules + amounts |
| POST | `/payments` | ACCOUNTANT+ | Returns payment + previous/remaining balance |
| GET | `/payments` | staff | Filters: member, method, status, from, to |
| POST | `/payments/:id/reverse` | ACCOUNTANT+ | Requires `reason`; creates mirror journal + negating ledger row; original marked REVERSED, never deleted |

Receipt numbers are server-generated `REC-YYYYMMDD-####` (per-day counter).

## Fees, reports, admin

| Method | Path | Role |
|---|---|---|
| GET | `/fee-rules` | staff |
| PATCH | `/fee-rules/:id` | SUPER_ADMIN — future charges only; history keeps snapshots |
| GET | `/reports/vehicles`, `/reports/weighbridge`, `/reports/payments`, `/reports/outstanding`, `/reports/income-expense` | MANAGER, ACCOUNTANT, SUPER_ADMIN — `?format=csv` for CSV export |
| GET | `/admin/dashboard` | staff |
| GET/POST/PATCH | `/notices` | staff manage; public read via `/public/notices` |
| GET/POST | `/expenses` | ACCOUNTANT+ |
| GET | `/audit` | SUPER_ADMIN, MANAGER |
| GET/PUT | `/settings` | SUPER_ADMIN (PUT) |
| GET/POST/PATCH | `/admin/users` | SUPER_ADMIN |

## Roles (least privilege)

- **SUPER_ADMIN** — everything, incl. users, fee rules, settings, audit
- **MANAGER** — members, entries, reports, notices, dashboard
- **ACCOUNTANT** — payments, ledger, expenses, reports, reconcile
- **OPERATOR** — vehicle + weighbridge entries only (cannot record payments)
- **MEMBER** — own member record + own ledger only
- **PUBLIC** — public directory/profile/outstanding/notices only
