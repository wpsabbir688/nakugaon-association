# Deployment (documentation only)

**Nothing in this document has been provisioned.** No Atlas cluster, no
hosting account, and no live URL exist for this project. The steps below are
for the association (or its developer) to follow when ready to go live.

## 1. Database — MongoDB Atlas (M0 free tier is enough to start)

1. Create a project + free cluster (any region close to Bangladesh, e.g.
   Mumbai `ap-south-1`).
2. Database Access: create a database user with a strong password; restrict
   to `readWrite` on the app database only.
3. Network Access: allow only the API host's IP (or `0.0.0.0/0` temporarily
   during setup — tighten before launch).
4. Connection string form:
   `mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority`
   Atlas clusters are replica sets by default, so transactions work.
5. Run the reference-data seeder on first boot (fee rules + chart of
   accounts seed automatically when the server starts with an empty database)
   — then create the real admin with `scripts/create-admin.js` against the
   Atlas URI. **Never run the demo seed against production.**

## 2. API — any Node host (Render, Railway, Fly.io, VPS)

- Runtime: Node.js 20+, `npm --prefix server install --omit=dev`.
- Start: `node server/src/index.js` (or `npm --prefix server start`).
- Environment: `MONGODB_URI` (Atlas), `PORT`, `NODE_ENV=production`,
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
- [ ] Backups enabled on the Atlas cluster (daily snapshots)
- [ ] HTTPS on both frontend and API (required for the HttpOnly
      cross-site refresh cookie: set `SameSite=None; Secure` in production —
      see `server/src` cookie settings)

## Known production gaps (not hidden)

- Uploads: local disk only; no S3 driver yet.
- Email: logged-only until SMTP is configured.
- Exports: CSV only; no .xlsx or PDF.
- No SMS, no payment-gateway integration, no offline mode.
