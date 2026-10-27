# LexiHive

The project has two application folders: `frontend` and `backend`. Each has its own `package.json`, lockfile, dependencies and development command. Root npm commands are optional shortcuts and install no root dependencies.

## Run every day

Open two terminals:

```powershell
cd D:\office\games-aashay-laxihive\backend
npm.cmd run dev
```

```powershell
cd D:\office\games-aashay-laxihive\frontend
npm.cmd run dev
```

Open http://localhost:5174. Backend health: http://localhost:4000/api/health.

Alternatively, start both from the project root with `npm.cmd run dev`. The launcher reuses healthy LexiHive servers already running on the configured ports. It does not kill unrelated applications or silently change ports. Ctrl+C stops only processes started by that launcher.

## First installation on another machine

Use Node.js 24. From the project root:

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run dev
```

The root install command installs the two apps. Alternatively, run `npm.cmd install` in each app, then `npm.cmd run setup` in backend. Setup preserves existing configuration and records. Do not repeat setup just to restart the app.

## Structure

```text
frontend/
  src/pages/          Customer and administrator screens
  src/components/     Reusable UI
  src/lib/            API, authentication and checkout helpers
  public/             Static assets
  e2e/                Browser tests
  scripts/            Frontend development, build and test helpers
  .env                Public VITE_ configuration only
  package.json
  package-lock.json

backend/
  src/routes/         API endpoints
  src/controllers/    Payment callback handlers
  src/services/       Wallet, game access, email and payment logic
  src/middleware/     Authentication, permissions and CSRF
  src/config/         Database and environment validation
  src/jobs/           Admin provisioning and payment maintenance
  prisma/             MongoDB schema, indexes and seed data
  shared/             One authoritative game catalog, engine and reward rules
  scripts/            Development, database, backup and setup tools
  test/               Unit and MongoDB integration tests
  docs/               Operating and deployment guides
  .local/             Private database files, backups and development screenshots
  .env                Private database, email and gateway credentials
  package.json
  package-lock.json
```

Frontend imports the pure game rules from `backend/shared` so the browser and server use identical rules. Keep both folders together when building the frontend; do not copy game rules into a second place. The compiled backend is independent of the frontend and starts from `backend/dist/src/index.js`.

## Configuration

The latest [launch upgrade report](backend/docs/LAUNCH_UPGRADE.md) covers optional customer email verification, collapsible navigation, settlement review, FX quotes and Render scheduling. `REQUIRE_EMAIL_VERIFICATION=false` is the local launch setting; administrator verification remains mandatory. The supplied Visa/Mastercard image is included in the footer.

- `backend/.env`: `APP_ORIGIN` controls the frontend URL and allowed browser origin; `PORT` controls the API port. The current frontend URL is http://localhost:5174. Use that exact hostname.
- `frontend/.env`: keep `VITE_API_URL=/api`. Vite proxies API requests to the configured backend port. Merchant credentials never belong here.
- Atlas and existing `.env` values were preserved. Previous local database files and backups now live in ignored `backend/.local/`. Database helpers use the new location. No accounts or financial records were deleted.
- First administrator: register and verify `support@lexihive.com`, then run `npm.cmd run admin:provision -- --email support@lexihive.com` in backend or from the root. Refresh `/admin`. There is no default admin password.
- All starter modes were initially free; administrators explicitly publish pricing changes. Test wallet spending with audited admin coin adjustments rather than marking gateway payments successful.
- Production payment verification automatically obtains Inquiry tokens from the member ID and working key, and requires public HTTPS callbacks and merchant API access. Production email verification requires working SMTP. See the gateway and deployment guides before enabling public commerce.

## Checks

From the project root:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:integration
npm.cmd run test:e2e
npm.cmd run build
```

Integration and browser tests use isolated local test databases, not the application's Atlas database. MongoDB Server must be installed for the default local test configuration. Browser tests use Chrome and ports 4011/5185.

Backend commands also run directly inside backend: `db:check`, `db:start`, `db:backup`, `db:generate`, `db:migrate`, `db:seed`, `payments:check`, `payments:reconcile`, `admin:provision` and `security:scan`. Payment reconciliation can fulfill verified purchases; it is not a read-only configuration check.

## What can be removed

Generated `dist`, test reports, coverage, Vite caches and `node_modules` can be recreated by builds, tests or installation. Do not delete `backend/.local`, `.env`, `.git`, source, tests, scripts or lockfiles for cosmetic cleanup. Dependencies, private configuration and database files are already ignored by Git.

See [administrator setup](backend/docs/ADMIN.md), [feature structure](backend/docs/STRUCTURE.md), [session billing](backend/docs/SESSION_BILLING.md), [payments](backend/docs/TRANSACTWORLD.md) and [deployment](backend/docs/DEPLOYMENT.md).
