> Current authentication behavior: production generates and refreshes Inquiry tokens automatically using MEMBER_ID and WORKING_KEY. No manually supplied TW_AUTH_TOKEN is required; it remains an optional override. Production verification remains server-to-server and fails closed when authentication or Inquiry is unavailable. Earlier launch observations below are historical.

# LexiHive launch upgrade - 27 October 2026

This report covers the supplied platform requirements and Visa/Mastercard footer image. It extends the existing application; there is one admin panel, wallet ledger, game engine and purchase-fulfillment operation. No code was committed, pushed or deployed, no paid game pricing was published, and no real payment was submitted.

## Delivered behavior

| Area | Result | Status |
| --- | --- | --- |
| Footer | Supplied Visa/Mastercard PNG copied unchanged to frontend/public/images and displayed accessibly with responsive sizing | IMPLEMENTED AND TESTED |
| Main sidebar | Persistent 260px/76px expanded/icon states, tooltips, reachable scrollable links, responsive workspace | IMPLEMENTED AND TESTED |
| Mobile navigation | Drawer, close/backdrop/Escape dismissal, focus trap, inert background and route dismissal | IMPLEMENTED AND TESTED |
| Admin navigation | Persistent collapse state, icons, scrollable sections and responsive layouts | IMPLEMENTED AND TESTED |
| Admin UI | Existing readable cards/forms/tables retained; wider navigation no longer overflows the catalog or resizing coin store | IMPLEMENTED AND TESTED |
| Email policy | Central REQUIRE_EMAIL_VERIFICATION flag; local flag false; optional customer confirmation without false verified timestamps | IMPLEMENTED AND TESTED |
| Verification reactivation | True restores spending/purchase/unlock checks and signup verification mail; existing unverified users must confirm their existing email | IMPLEMENTED AND TESTED |
| Admin security | Verified active ADMIN, password checks, CSRF, no public admin signup, protected first-admin provisioning and last-admin rules | IMPLEMENTED AND TESTED |
| Admin roles | Existing USER/ADMIN model retained; finance/support capabilities remain inside verified ADMIN rather than introducing unapproved role permissions | IMPLEMENTED AND TESTED |
| Wallet management | Existing audited additions/deductions/target corrections and debt rules preserved | IMPLEMENTED AND TESTED |
| EUR/USD prices | Explicit independent-price policy preserved; opt-in FX_BASED policy uses integer arithmetic and dated ECB observations | WAITING FOR ADMIN ACTIVATION |
| FX provider | Documented Frankfurter v2 ECB adapter, persistent cache, rate-age limit, safe provider-outage behavior and quote snapshots | IMPLEMENTED AND TESTED |
| Hosted checkout | Existing signed form, merchant currency restriction, notification/return and exact amount/currency verification retained | IMPLEMENTED BUT NOT END-TO-END VERIFIED |
| Missing callback recovery | Admin can supply a provider payment ID; authenticated Inquiry must match the original merchant reference, amount and currency before it is bound | IMPLEMENTED AND TESTED |
| Settlement recovery | Evidence reference, explanation, password confirmation, two distinct verified admins, rejection, audit and unique settlement claims | IMPLEMENTED AND TESTED |
| Exactly-once credit | Gateway capture and settlement approval share fulfillCoinPurchase and the original unique ledger reference in one transaction | IMPLEMENTED AND TESTED |
| Revenue reports | Native-currency/source totals, date filter, recorded-rate base-currency equivalent, explicit exclusion count for historical missing FX | IMPLEMENTED AND TESTED |
| Game pricing/trials | Existing 20 modes, unpublished recommendations, 30-second previews, consent, recovery/refunds and permanent ownership retained | IMPLEMENTED AND TESTED |
| Support | Existing support@lexihive.com configuration and optional reply-time aim retained; no ticketing system added | IMPLEMENTED AND TESTED |
| Reconciliation schedule | One-shot maintenance command and Render web/cron blueprint supplied; no dependence on a sleeping web-service timer | WAITING FOR CONFIGURATION |
| Hosted launch | Netlify target and Render instructions prepared for the supplied domains; health URLs returned 404 when checked | WAITING FOR CONFIGURATION |
| Live merchant capture | Inquiry token, enabled merchant currencies/card routes and external callback delivery must be verified by the owner/provider | BLOCKED BY EXTERNAL PROVIDER |
| Final prices, support promises and legal policies | Existing settings retained; no new operating promises or paid tiers were silently enabled | REQUIRES BUSINESS APPROVAL |

## How to run locally

From the root, npm.cmd run dev starts/reuses frontend and backend. Separate terminals can run npm.cmd run dev inside each app. Local frontend: http://localhost:5174. API: http://localhost:4000/api/health.

Keep the two application folders together. Frontend imports pure rules from backend/shared. Browser tests live in frontend/e2e; database tools, docs and private backups live under backend. Existing .gitignore rules already exclude all installed dependencies, builds, .env files, private databases and reports.

## Email policy

REQUIRE_EMAIL_VERIFICATION=false permits unverified customers to purchase coins, spend on a session and unlock an expansion, subject to the normal authentication, balance and gateway checks. Signup does not send mandatory mail. Optional confirmation remains in Settings. Existing records are not marked verified.

Set the flag to true to restore the original paid-feature gates. Users created during the bypass must verify their existing email before future coin purchases/spending; no grace period or silent verification is applied. Login, free play and saved progress remain available under the existing account policy. Existing verification tokens/routes and password-reset checks remain intact.

Production can start without SMTP when customer verification is disabled. Email-dependent reset/verification requests return a clear unavailable response when delivery is unconfigured. Enabling mandatory verification requires SMTP_HOST and MAIL_FROM at startup. Administrators must still be verified even while customer confirmation is optional.

## Payment investigation and settlement

1. Search Payments by order, customer, merchant reference or provider ID.
2. Use Verify with gateway. If the signed callback never supplied an ID, enter the gateway payment ID from merchant records. The backend queries the documented Inquiry endpoint and validates all original order fields before persisting the ID or fulfilling coins.
3. If Inquiry is unavailable, use Review external settlement only when authoritative merchant/bank evidence proves that exact order was received. Supply an individual external transaction reference, protected evidence/document reference, explanation, administrator password and attestation.
4. A different verified active administrator opens Pending payment recovery, independently checks the evidence, enters a reason/password and approves or rejects. An administrator cannot review or approve their own purchase.
5. Approval creates one purchase/ledger credit and records MANUAL_SETTLEMENT. It does not forge gatewayStatus or gatewayVerifiedAt. A late genuine capture does not add coins again.
6. Without payment evidence, use an audited goodwill coin adjustment instead. It never marks the payment successful or creates revenue.

A rejected review can be resubmitted with corrected evidence. A settlement reference already used for fulfillment cannot fund another order. Concurrent role changes, approvals and gateway captures are protected by transactions and unique claim/ledger identifiers. Database-owner access remains privileged; do not fix finances by editing status, credited or balance in Compass.

## Currency policy

INDEPENDENT preserves the existing separately configured coins/USD and coins/EUR prices; it makes no claim that EUR equals USD. FX_BASED must be explicitly saved under Admin > Coin store settings. COIN_BASE_CURRENCY selects EUR or USD. Only merchant-enabled currencies can proceed to checkout; displaying USD does not activate a USD merchant route.

The supported provider is FX_PROVIDER=FRANKFURTER_ECB. Rates come from https://api.frankfurter.dev/v2/providers/ecb/rate/eur/usd (or the inverse pair), as documented at https://frankfurter.dev/. The actual endpoint and response shape were checked read-only. No account/payment data is sent to it.

Default cache refresh is one hour; observations may be at most seven days old to accommodate non-working days. Adjust FX_RATE_CACHE_TTL_SECONDS and FX_MAX_RATE_AGE_SECONDS deliberately. A provider outage can reuse a still-valid cached observation, with a warning; stale, invalid, mismatched or future data cannot produce a converted quote. The final virtual-coin amount is rounded down once with BigInt arithmetic; reporting money is rounded to the nearest minor unit.

CoinQuote and Payment retain the accepted amount, currency, quantity, pricing version, base amount, provider, rate and observation date. Later FX updates cannot rewrite the accepted quote/payment. Reporting uses the recorded historical rate, never today's rate for an old purchase. Old cross-currency orders without a recorded rate remain visibly unconverted.

## Database preservation

A private snapshot was saved to backend/.local/backups/2026-10-27T08-27-43-096Z before migration 005. It contains all 26 original collections. The standalone additive migration created SettlementReview, SettlementClaim and FxRate plus metadata defaults. It removed no collections/indexes and changed no amounts, existing prices or payment outcomes.

The preservation check compared 100 original records against the snapshot: missing=0, changed=0. Migration bookkeeping and newly added fields were excluded from comparison. Previous local MongoDB/PostgreSQL files and older backups remain intact.

For an existing database, use npm.cmd run db:backup then npm.cmd run db:migrate:launch from backend to apply only the new additive migration. For a fresh installation, the normal db:migrate/db:seed path prepares all collections/indexes. Never pass destructive synchronization flags.

## Deployment

Frontend: https://lexihive09.netlify.app. Backend: https://laxihive.onrender.com. Database: configured Atlas replica set. No deployment was triggered by this work.

Render Node web service: root backend; build npm ci --include=dev && npm run db:generate && npm run build; start npm run db:migrate && npm run db:seed && npm start; health /api/health; NODE_VERSION=24; NODE_ENV=production; APP_ORIGIN=https://lexihive09.netlify.app; PUBLIC_API_URL=https://laxihive.onrender.com; REQUIRE_EMAIL_VERIFICATION=false. Configure DATABASE_URL, a private session secret and support/merchant variables in Render, never frontend variables.

frontend/netlify.toml pins Node 24, /api and the supplied public API target. The build helper emits the API proxy before the SPA fallback, preserving same-origin session cookies. Keep the whole repository checkout available even with frontend as the base directory. No merchant/database secrets belong in Netlify or VITE_ variables.

For production scheduling, create a Render environment group named lexihive-production with backend database/gateway credentials, review backend/render.yaml, and apply it deliberately. It defines a Node web service and a separate */5 * * * * UTC cron running node dist/src/jobs/maintenance.js. A cron is a separately billed service; none was created by this work. Manual service creation can use the same commands and environment group. The one-shot job exits after cleanup/verification and fails visibly if provider checks fail. PAYMENT_MAINTENANCE_MODE=scheduled disables the internal timer; select it only after the cron is configured. Local development retains interval mode.

Render Free instances sleep and block common SMTP ports. Use a suitable production compute/email setup; configured SMTP can remain available even when customer verification is optional. See https://render.com/docs/cronjobs and https://render.com/docs/free.

Keep PAYMENTS_ENABLED=false on a new public deployment until automatic merchant authentication, merchant-enabled routes and public HTTPS notification/return delivery are verified. Leave callback overrides unset to derive the existing routes from PUBLIC_API_URL. Do not copy local callback overrides into production. Production ignores TW_ALLOW_LOCAL_CHECKOUT.

## Important changed/created files

- frontend/src/components/Layout.tsx, UI.tsx and platform.css: navigation, drawer and footer.
- frontend/public/images/visa-mastercard.png: supplied original image.
- frontend/src/pages/Admin.tsx, components/AdminTools.tsx and SettlementReview.tsx: management, evidence workflow, FX selection and reports.
- frontend/src/components/CoinSlider.tsx, EmailVerification.tsx, pages/Player.tsx, Info.tsx, Store.tsx and lib/api.tsx: policy-aware UI and quote provenance.
- backend/src/config/account-policy.ts, environment.ts, index.ts, auth middleware/routes and spending/checkout services: centralized optional verification with admin safeguards.
- backend/src/services/wallet.service.ts, transactworld.service.ts, stripe.service.ts and settlement.service.ts: common fulfillment and recovery.
- backend/src/services/fx.service.ts, coin-quote.service.ts, reporting.service.ts and shared/money.ts: exact conversion, quote snapshots and source-aware reporting.
- backend/prisma/schema.prisma, migrate.ts and launch-migration.ts: additive collections/fields and metadata defaults.
- backend/scripts/backup.mjs and verify-preservation.mjs: safe backup failure messages and preservation checks.
- backend/src/jobs/maintenance.ts, maintenance.service.ts, render.yaml, frontend/netlify.toml and backend/.env.example: deployment and scheduling.
- backend/test/launch-policy.test.ts, launch.integration.ts, frontend/e2e/launch.spec.ts and fixture/test configuration: new coverage. Existing verification/payment/game tests are retained.

No source or database folders were deleted for cosmetic cleanup. Generated test reports can be recreated and remain ignored. The supplied live merchant keys were previously disclosed in chat; rotate them through the provider before public commerce. No secret/history rewrite or Git push was performed.

## Final validation results

- Unit tests: 54 passed.
- MongoDB integration suite: 50 reported tests passed, including all existing game/payment/account checks and new launch-policy/settlement/FX cases.
- Browser coverage: 18 existing core/billing cases passed after responsive fixes, and all six launch cases passed in a focused run. The launch cases include direct sidebar/content-boundary checks after resizing, focus trapping, email reactivation, two-browser settlement approval, footer images and unfulfilled display-status handling. An initially incorrect test locator was corrected before the focused pass.
- TypeScript and ESLint: passed for frontend/backend.
- Production builds: passed for frontend/backend; generated Netlify /api proxy points to the supplied HTTPS backend before the SPA fallback.
- Targeted source/history scan: 136 candidate files, two revisions, zero findings. Frontend build scan: no configured backend secrets in 16 text output files.
- Preservation: 100 original Atlas records compared, missing 0, changed 0. The supplied footer image matches its built output byte-for-byte.
- Local runtime: healthy proxied API, REQUIRE_EMAIL_VERIFICATION=false, 20 games, zero paid starter modes, independent pricing and EUR merchant checkout. Both local servers were left running.

The private administrator screenshot was visually reviewed after correcting responsive margin animation. Native 200% browser-toolbar zoom, deployed SMTP delivery, live merchant capture/notification delivery, token renewal, Docker execution and hosted cron activation were not independently certified by these local checks.
