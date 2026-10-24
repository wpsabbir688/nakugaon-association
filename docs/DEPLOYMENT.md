# Deployment (documentation only)

**Nothing in this document has been provisioned.** No Neon database, no
hosting account, and no live API URL exist for this project yet (the Netlify
frontend shell is live, but it has no API behind it until the steps below
are done). The steps below are for the association (or its developer) to
follow when ready to go live.

## 1. Database — Neon PostgreSQL (free tier is enough to start)

1. Create a Neon project + database (region close to Bangladesh, e.g.
   Singapore).
2. Create a database role with a strong password, restricted to the app
   database.
3. Copy the **direct (non-pooled)** connection string — pooled
   (PgBouncer transaction-mode) URLs break Prisma interactive transactions,
   which this app requires. The string must look like:
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
4. Apply the schema once against that database:
   `DATABASE_URL='<direct-url>' npx prisma migrate deploy` (run from
   `server/`).
5. Fee rules + chart of accounts seed automatically when the server starts
   — then create the real admin with `scripts/create-admin.js` against the
   Neon URI (e.g. via a one-time Render build command, since Render's free
   Shell is paywalled). **Never run the demo seed against production.**

## 2. API — any Node host (Render, Railway, Fly.io, VPS)

- Runtime: Node.js 20+, root directory `server`.
- Build: `npm install && npx prisma generate && npx prisma migrate deploy`.
- Start: `npm start` (runs `node src/server.js`; `PORT` comes from the host).
- Environment: `DATABASE_URL` (Neon direct URL — never pooled), `PORT`,
  `NODE_ENV=production`,
  `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (long, random, different),
  `CLIENT_URL` (the exact frontend origin — CORS allows only this origin),
  `STORAGE_DRIVER=local`, `UPLOAD_DIR` (a persistent disk path — on
  ephemeral hosts, uploads are lost on redeploy; use a persistent volume or
  implement the S3 driver first).
- Health check: `GET /health` must return `{"ok":true,"db":"up"}`.
- The server serves `/uploads` statically for member photos; in production,
  serve them behind the same origin or a CDN with the same access rules.

## 3. Frontend — Vercel / Netlify (static)

```bash
cd client && npm install && npm run build   # outputs client/dist/
```

- Publish `client/dist/` as a static site.
- Set `VITE_API_URL=https://<api-host>/api/v1` at build time.
- SPA fallback: **all routes must serve `index.html`** (Vercel: `rewrites`
  to `/index.html`; Netlify: `/* /index.html 200` in `_redirects`), otherwise
  `/bn/members` etc. will 404 on refresh or direct link.
- No secrets are needed in the frontend build — only the public API URL.

## 4. Before sharing publicly

- [ ] Real admin created; demo admin (`admin@nakugaon.local`) does not exist
- [ ] `JWT_*` secrets are long random values, not the examples
- [ ] Site settings filled with association-confirmed contact details only
- [ ] CORS `CLIENT_URL` is the exact production frontend origin
- [ ] Uploads on persistent storage (or S3 driver implemented)
- [ ] SMTP configured if password-reset email is expected (otherwise resets
      are log-only and staff must assist)
- [ ] Backups enabled on the Neon project (point-in-time recovery / snapshots)
- [ ] HTTPS on both frontend and API (required for the HttpOnly
      cross-site refresh cookie: set `SameSite=None; Secure` in production —
      see `server/src` cookie settings)

## Known production gaps (not hidden)

- Uploads: local disk only; no S3 driver yet.
- Email: logged-only until SMTP is configured.
- Exports: CSV only; no .xlsx or PDF.
- No SMS, no payment-gateway integration, no offline mode.
