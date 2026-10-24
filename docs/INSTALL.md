# Install & run

## Prerequisites

- Node.js 20+ and npm
- MongoDB 8.x

## MongoDB: replica set required

Transactions (vehicle/weighbridge/payment posting) require a replica set, even
for a single server. Start a single-node replica set:

```bash
# Data directory
mkdir -p /path/to/mongo-data

# Start mongod with replSet
mongod --dbpath /path/to/mongo-data --bind_ip 127.0.0.1 --port 27017 --replSet rs0 --fork --logpath /path/to/mongod.log

# Initiate the set (once)
mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})'
```

Wait for `rs.status().ok === 1` before starting the server. If the server cannot
reach a replica set, transaction writes fail loudly at startup checks — this is
by design, so a charge can never half-post.

Connection string form:

```
MONGODB_URI=mongodb://127.0.0.1:27017/nakugaon?replicaSet=rs0
```

For tests, the suite uses a separate database (`nakugaon_test`) on the same
server; it drops and recreates its collections per run.

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
| `MONGODB_URI` | yes | Include `?replicaSet=rs0` |
| `PORT` | no | Default 4001 in the example |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | yes | Long random strings, different from each other |
| `CLIENT_URL` | yes | Frontend origin, e.g. `http://localhost:5173` |
| `STORAGE_DRIVER` | no | `local` only (implemented). Do not set `s3`. |
| `UPLOAD_DIR` | no | Default `uploads` (relative to `server/`) |
| `SMTP_*`, `EMAIL_FROM` | no | Until set, password-reset emails are logged only |

`.env` files are gitignored. `.env.example` contains placeholders only.

## First admin

```bash
ADMIN_PASSWORD='<redacted>' node server/scripts/create-admin.js
```

Options via env: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 8 chars).
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
