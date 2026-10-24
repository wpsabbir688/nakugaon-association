# Install & run

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL 16 (local dev/test databases)

## PostgreSQL: local setup

```bash
# Create the dev + test databases (example: role nakugaon)
sudo -u postgres psql -c "CREATE ROLE nakugaon LOGIN PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE nakugaon_dev OWNER nakugaon;"
sudo -u postgres psql -c "CREATE DATABASE nakugaon_test OWNER nakugaon;"
```

Multi-write financial operations (vehicle/weighbridge/payment posting) run
inside Prisma interactive transactions (`prisma.$transaction`), so a charge
can never half-post. No replica set or special cluster mode is required —
plain PostgreSQL works, locally and on Neon.

Apply the schema with Prisma Migrate:

```bash
cd server
npx prisma migrate dev        # creates/updates nakugaon_dev
```

On networks where Prisma's postinstall engine download is blocked (Node fetch
reset by an egress proxy), install with `--ignore-scripts` and fetch the
engines with curl instead:

```bash
npm install --ignore-scripts
./scripts/setup-engines.sh
eval "$(./scripts/setup-engines.sh)"   # exports PRISMA_*_BINARY for the CLI
```

For tests, the suite uses a separate database (`nakugaon_test`); it
truncates all tables per run. Set `TEST_DATABASE_URL` to point at it, or
accept the socket default documented in `server/tests/api.test.js`.

## Install

```bash
npm run install:all
```

## Configure

```bash
cp .env.example server/.env
```

Edit `server/.env`:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string, e.g. `postgresql://user:password@localhost:5432/nakugaon_dev` |
| `PORT` | no | Default 4001 in the example |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Long random strings, different from each other |
| `CLIENT_URL` | yes | Frontend origin, e.g. `http://localhost:5173` |
| `STORAGE_DRIVER` | no | `local` only (implemented). Do not set `s3`. |
| `UPLOAD_DIR` | no | Default `uploads` (relative to `server/`) |
| `SMTP_*`, `EMAIL_FROM` | no | Until set, password-reset emails are logged only |

`.env` files are gitignored. `.env.example` contains placeholders only.

## First admin

```bash
ADMIN_PASSWORD='<redacted>' node server/scripts/create-admin.js "Full Name" admin@example.com
```

The script refuses to overwrite an existing admin with the same email.

## Run

```bash
# Both (from repo root): server :4001, client :5173
npm run dev

# Or separately:
npm --prefix server run dev
npm --prefix client run dev
```

The Vite dev server proxies `/api` to `http://localhost:4001`. Production
builds use `VITE_API_URL` instead (see `docs/DEPLOYMENT.md`).

## Demo data (fictional only)

```bash
SEED_DEMO=true node server/scripts/seed.js
```

Creates 6 members labelled "(Demo)", demo charges/payments, and a demo admin
`admin@nakugaon.local`. The script refuses to run unless `SEED_DEMO=true` is
set. **Never run it against a database holding real records.**
