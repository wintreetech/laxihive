> Current authentication behavior: production generates and refreshes Inquiry tokens automatically using MEMBER_ID and WORKING_KEY. No manually supplied TW_AUTH_TOKEN is required; it remains an optional override. Production verification remains server-to-server and fails closed when authentication or Inquiry is unavailable. Earlier launch observations below are historical.

# Deployment and owner configuration

## Current Render / Netlify launch

See [LAUNCH_UPGRADE.md](LAUNCH_UPGRADE.md) for the current deployment checklist and backend/render.yaml. Render Node root is backend; build is `npm ci --include=dev && npm run db:generate && npm run build`; start is `npm run db:migrate && npm run db:seed && npm start`; health path is `/api/health`. The configured public origins are https://lexihive09.netlify.app and https://laxihive.onrender.com. Hosting was not deployed by the upgrade.

Set `REQUIRE_EMAIL_VERIFICATION=false` for the temporary launch policy. Production startup then permits missing SMTP, but email-dependent actions fail safely until delivery is configured. Setting it to true requires production SMTP and restores the original paid-feature gates for unverified customers. Verified-admin requirements always remain. Backend credentials belong only in the backend host's environment.

The Netlify configuration supplies Node 24, /api and the public backend proxy target. Create the separate Render cron deliberately before selecting scheduled maintenance mode; it is a separately billed service. Use an appropriate compute/email plan for production; a sleeping free web service does not provide an always-running reconciliation timer.

## Current platform release

The current release adds migration 004, first-admin provisioning, unpublished game-pricing drafts, trial/session billing and background maintenance. Read [the release review](RELEASE_REVIEW.md), [Admin setup](ADMIN.md) and [session billing](SESSION_BILLING.md) before publishing prices. Seeding never assigns admin roles and never publishes paid starter pricing.

For the selected Transactworld provider, production additionally requires `PAYMENT_PROVIDER=transactworld`, `TW_ENVIRONMENT=live`, `MEMBER_ID`, `WORKING_KEY`, merchant-enabled `TW_SUPPORTED_CURRENCIES`, automatic merchant API authentication, `PUBLIC_API_URL` as the public HTTPS API origin, and `PAYMENT_RECONCILIATION_ENABLED=true`. Set `PAYMENT_RECONCILIATION_SECONDS` to 60 initially. Hosted return and notification overrides can stay blank to derive the standard routes. Stripe keys below apply only to the existing optional Stripe test adapter.

Configure `SUPPORT_EMAIL`, an HTTPS `APP_ORIGIN`, production SMTP and a fresh random session secret. Rotate merchant keys disclosed during development. Token renewal, external payment delivery, deployment, SMTP delivery and refund/dispute behavior need external verification. The local application checks do not certify a production launch.

Before upgrading an existing database, stop this project's API, back up, generate the client, migrate, seed and build. Do not use destructive synchronization flags. New collections/indexes and defaults are additive; existing wallet balances, payments, game results and entitlements remain intact.

`npm.cmd run db:backup` provides a private local Extended JSON snapshot. Use managed backups, restricted database accounts, tested restoration and external audit retention in production. Keep `backend/.local/` private. The application audit API is append-only; database-owner tampering requires operational protections.

## MongoDB

This installation uses a fresh Atlas database by owner choice; local history remains in the preserved local database and backup. The Atlas SRV URL was converted to its equivalent standard replica-set URI after a TLS-verified Prisma probe resolved a Windows SRV issue. Keep TLS/certificate verification enabled. Where SRV is supported, it remains the preferred MongoDB format; if a standard seed list changes, obtain updated connection details from Atlas. `npm.cmd run db:resolve-atlas -- --apply` can validate an Atlas SRV configuration before saving its equivalent standard format without printing credentials. `npm.cmd run db:check` performs a read-only setup check.

Tests default to separate local `_test` databases on port 27018, independently of the application's Atlas URL. Integration/browser commands check or start the dedicated local replica set. A deliberately configured `TEST_DATABASE_URL` must identify isolated test storage, never the application database.

Use MongoDB Atlas or another authenticated MongoDB replica set. Set a scoped `DATABASE_URL`, enable TLS, restrict network access to the Node host, configure backups, and retain database administrative access separately from the application account. Do not expose the unauthenticated local Docker database publicly.

The selected Prisma 6.12 release and client are pinned together. Its MongoDB connector supports the transaction and relation features used here, and the dependency audit was checked during implementation. Upgrade deliberately with database and payment regression tests rather than accepting automatic major-version changes.

Run from the repository root:

```sh
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
```

`db:migrate` synchronizes Prisma indexes and then applies the idempotent MongoDB integrity migration. MongoDB does not support Prisma SQL Migrate. The additional payment indexes are partial unique indexes for non-null Stripe IDs. The wallet validator enforces nonnegative whole balances/debt. Structural changes must be reviewed with a backup; do not run destructive synchronization flags.

## Node host / Railway

Deploy the repository with `backend/Dockerfile` and set the health path to `/api/health`. `backend/railway.json` is supplied; select that config path in the Railway service when the repository root is the build context. The container generates Prisma, builds TypeScript, synchronizes MongoDB indexes and starts the API. It needs network access to your replica set.

Required backend environment:

| Variable                              | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                        | MongoDB replica-set/Atlas connection string; backend only         |
| `SESSION_SECRET`                      | Independently generated random secret, at least 32 characters     |
| `APP_ORIGIN`                          | Exact frontend origin, such as `https://play.your-domain.example` |
| `NODE_ENV`                            | `production`                                                      |
| `PORT`                                | Host-provided API port                                            |
| `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` | Operational verification/reset delivery                           |
| `SMTP_USER`, `SMTP_PASSWORD`          | Provider credentials, where required                              |
| `ADMIN_EMAIL`                         | Default email for the explicit first-admin provisioning command   |
| `STRIPE_SECRET_KEY`                   | Test secret key for prelaunch payment verification                |
| `STRIPE_WEBHOOK_SECRET`               | Signing secret for this exact deployed webhook endpoint           |
| `PAYMENTS_ENABLED`                    | `false` until test credentials and pricing are configured         |
| `STRIPE_AUTOMATIC_TAX`                | Enable only after Stripe Tax configuration is ready               |

Backend secrets must never be prefixed with `VITE_`. Production requires HTTPS so the HttpOnly session cookie’s Secure flag is effective. Only the configured frontend origin may mutate resources. Password changes revoke other sessions; resetting a password revokes all sessions.

## Netlify frontend

Select `frontend/netlify.toml` as the configuration file and use frontend as the build base. Build command inside frontend: `npm run build`. Publish directory relative to that base: `dist`. Keep the repository checkout available because the frontend imports the pure game rules in `backend/shared`.

Set `API_PROXY_TARGET` to the backend’s HTTPS **origin**, for example `https://your-api-host.example`, without `/api`. Keep `VITE_API_URL=/api`. The post-build helper writes `_redirects`, putting `/api/*` → your backend before the SPA fallback.

This same-origin proxy is important: unrelated default Netlify and Railway domains cannot share a `SameSite=Lax` browser session directly. A proxy keeps browser authentication same-origin. An alternative is frontend/API custom subdomains under the same site with explicit CORS and `VITE_API_URL` set to the API origin. Test the actual domain configuration, redirect handling and Set-Cookie behavior before release.

All routes fall back to `index.html`; secrets stay on the backend. Fonts are bundled locally. After deployment, verify `/api/health` from the frontend domain and repeat signup/login/logout, CSRF, profile and saved-game flows.

## Transactworld activation

The selected provider is Transactworld Standard Checkout with the supplied live merchant mode/brand. Follow [TRANSACTWORLD.md](TRANSACTWORLD.md) for the working-key form request, full-status signed return, optional Backoffice Inquiry token and public HTTPS callbacks. Production ignores `TW_ALLOW_LOCAL_CHECKOUT`; deploy reachable notification and return routes before accepting customers. Local browser-return testing uses the current API port 4000. The previous project's ports 8080/5000 are not used. No external live charge was attempted.

## Optional Stripe test activation

1. Configure test keys and the deployed signed webhook endpoint.
2. Register and verify an owner account, then run `npm run admin:provision -- --email owner@example.com`. Seeding does not promote accounts.
3. Review the USD and EUR coin rates, min/max and slider step through Admin. New stores start at 100 coins per unit in either currency. These are independently configured prices, not a foreign-exchange conversion.
4. Enable test payments, then complete an actual Stripe test Checkout in a browser. Confirm exactly one ledger credit after the webhook and none from visiting the success URL alone.
5. Repeat delivery, abandon Checkout, fail payment, issue partial/full refunds, and exercise a dispute in test mode. Check owner linkage, reconciliation amounts and audit records.

The code currently rejects live keys and live events. Before intentionally changing that restriction, finalize legal operator/contact details, currency terms, support/refund handling, tax settings, geographic/age requirements, monitoring, incident response and independent security review. There is no assertion that these business decisions have been completed.

## Operations

Monitor health, HTTP error counts, payment failures, webhook delivery and MongoDB transaction conflicts. Application error logs exclude passwords, session cookies, card data and full request bodies. Review outstanding wallet balances and reconciliation amounts in Admin. Backups need restore drills. Configure host log retention and alerts; no monitoring vendor or owner support email has been fabricated.

Rate limits are process-local; a single Node instance is the deployment default. Before horizontal scaling, use a shared rate-limit store and test client-IP handling through your trusted proxy. `trust proxy` currently expects one production reverse-proxy hop; change that only to match the actual hosting chain. Treat replay validation as basic score integrity, not proof of a human player. Any stronger competition requires additional anti-bot and server interaction controls.
