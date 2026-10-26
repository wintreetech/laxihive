# LexiHive implementation and readiness review

Updated 27 October 2026. This is an implementation handoff, not a production-payment certification.

## Current state

The existing React/Express/MongoDB application was extended rather than replaced. All 20 game engines remain in place. All starter modes remain FREE_FULL until an administrator publishes a different mode configuration. Proposed 25/50/75/100-coin prices are review drafts. The five existing permanent expansions retain their 500-coin starting price and existing ownership semantics.

At the owner's request, the newly configured Atlas database was kept fresh. Its schema, indexes, game catalog, achievements, expansion defaults, site settings and unpublished mode proposals were initialized. Existing local accounts and financial history were not imported. They remain in the local MongoDB database and private backup.

Prisma's Windows SRV lookup failed while the native driver could reach Atlas. The connection was changed to the equivalent standard replica-set format obtained from the authenticated cluster. Prisma connectivity was verified before saving it; TLS and certificate checks remain enabled. Credentials remain in ignored `backend/.env` and were not printed. See `scripts/resolve-atlas.mjs` and [MongoDB's SRV troubleshooting guidance](https://www.mongodb.com/docs/manual/troubleshooting/server-selection-timeout/).

## Delivery status

| Area                                             | Status                                      | Evidence / outstanding work                                                                                            |
| ------------------------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Twenty existing games and server replay          | Completed and tested                        | Unit tests, saved-game integration tests and browser starts                                                            |
| Configurable access modes and draft publication  | Completed and tested                        | FREE_FULL, trial, upfront session, premium session and existing permanent ownership                                    |
| Trial expiry and explicit continuation           | Completed and tested                        | Server timestamps, daily grant, no automatic charge, fresh paid attempt                                                |
| Wallet accounting and paid-session recovery      | Completed and tested                        | Atomic ledger references, duplicate/concurrent requests, debt and unstarted refunds                                    |
| Admin user/coin/pricing/session/payment controls | Completed and tested                        | Authenticated fixture accounts, backend permission checks and UI tests                                                 |
| First real administrator                         | Awaiting configuration                      | Register and verify `support@lexihive.com`, then run the provisioning command                                          |
| Paid starter rollout                             | Awaiting administrator activation           | No paid starter configuration was published in the application database                                                |
| Transactworld verification/recovery              | Implemented; awaiting external verification | Production requires authenticated Inquiry; scheduler and verified fulfillment are tested with provider test transports |
| Merchant verification credential                 | Blocked by missing credential               | `TW_AUTH_TOKEN` and operational renewal details were not supplied                                                      |
| Public gateway delivery                          | Awaiting deployment/configuration           | Public HTTPS API return/notification URLs and real delivery must be verified                                           |
| Support email                                    | Configured; delivery unverified             | Owner supplied `support@lexihive.com`; no guaranteed two-hour response is displayed                                    |
| Production account email                         | Awaiting SMTP configuration                 | Local one-use verification links work; external SMTP delivery was not tested                                           |
| Prices, fees, policies and operating commitments | Requires business decision                  | Final tiers, margins, operator/policy details and support operations need owner review                                 |
| GitHub hygiene                                   | Completed and checked                       | Ignored credentials/local data, targeted current/history scan; no push or history rewriting                            |
| Production deployment                            | Not performed                               | Docker/hosting, external callbacks, SMTP and token renewal need deployment validation                                  |

## How the customer workflow works

1. Browse games and read backend-provided access labels.
2. Play a fully free mode, sign in for an eligible practice preview, or review a priced full attempt.
3. A preview starts after readiness and expires by the server clock. It cannot award score, XP, achievements or coins.
4. At expiry, choose to confirm the exact saved coin charge, buy coins, or exit. No countdown purchases anything.
5. Purchase activates one fresh full attempt. Refresh recovers the same authorization and action replay; it does not debit again.
6. Completion is replay-validated. Eligible full wins retain existing XP/achievement rules. Paid and advanced scores do not enter competitive leaderboards.
7. Wallet history distinguishes session charges/refunds, permanent unlock spending, purchases, rewards and admin adjustments.

The price and configuration version are snapshotted when the request is created. Future publication does not change an existing offer or authorization. A started attempt ends through a result, abandonment or timeout; another attempt requires another explicit purchase. An unstarted charged session can be cancelled/refunded once, including automatic stale-launch recovery.

See [session billing](SESSION_BILLING.md), [all 20 recommendations](GAME_PRICING.md) and [wallet accounting](WALLET.md).

## Administrator handoff

1. Open the local app at `http://localhost:5174/signup` and register `support@lexihive.com` with a password chosen by the owner.
2. Verify the account through Settings. Local development can open the verification link directly; production uses email.
3. From the repository root run:

```powershell
npm.cmd run admin:provision -- --email support@lexihive.com
```

4. Refresh and open `/admin`. No default administrator password exists. Further role changes require an admin password, and the last active admin is protected.
5. Use Users > View user > Adjust coins for credits, debits or a target correction. Review the resulting balance and provide a reason. Large changes require password confirmation. They are never recorded as verified purchases.
6. Use Game pricing to edit a draft and explicitly Publish this mode. Use Premium expansions for permanent prices/availability, and Coin store settings for purchase rates/limits.

The panel also provides searchable/paginated transactions, sessions, payments, audit records, role/status management and real analytics. Revenue stays separate from internal coin consumption. Known reversals are capped per order. Category profit is explicitly unavailable without attributable fees/taxes/costs. Application audit records have no edit/delete endpoint; production still needs protected database access and external audit retention.

## Payments and recovery

Hosted form requests retain DB/CC/VISA, exact backend amounts/currencies and unique transaction references. Credentials remain on the backend. Signed notifications/returns bind provider references; production fulfillment independently verifies capture through Inquiry. A success-page visit never credits coins.

Maintenance automatically reconciles eligible known provider IDs when configured, persists session expiry, refunds unstarted authorizations and labels stale unidentified checkouts abandoned. Late verified capture can still settle an order. Missing provider IDs require merchant-reference investigation; account-specific merchant-ID Inquiry and automatic authentication renewal remain external integration follow-ups. No unsafe manual payment-success control exists.

No real charge was initiated during this upgrade. Current EUR availability is retained; USD merchant routing is not claimed. See [the gateway guide](TRANSACTWORLD.md).

## Files created

- Backend: `src/config/environment.ts`; `src/services/game-access.service.ts`, `maintenance.service.ts`, `reporting.service.ts`; `src/routes/admin-management.routes.ts`; `src/jobs/provision-admin.ts`.
- Frontend: `src/lib/gameSession.tsx`, `src/components/AdminTools.tsx`, `src/platform.css`.
- Shared: `backend/shared/access.ts` with types, labels and unpublished recommendations for the actual catalog.
- Tools: `scripts/backup.mjs`, `check-database.mjs`, `resolve-atlas.mjs`, `generate-client.mjs`, `security-scan.mjs`, `test-database.mjs`, `run-browser-tests.mjs`, `test-frontend.mjs`.
- Tests: `backend/test/billing.integration.ts`, `game-access.test.ts`, `browser-server.ts`, and `e2e/billing.spec.ts`.
- Guides: `ADMIN.md`, `GAME_PRICING.md`, `SESSION_BILLING.md`, `WALLET.md`, this review.

## Files modified

- Backend schema/migration/seed; app/startup; auth middleware; auth, game, profile, payment and admin routes; Transactworld controller/service; reconciliation job; environment example.
- Frontend Admin, Play, Catalog, Home, Store and Info pages; Layout, UI and CoinSlider components; main stylesheet/imports.
- Shared catalog type; root commands, Playwright configuration, ignore files; startup database helper; existing setup/deployment/structure/payment/readme documentation; relevant existing payment tests and test-database selection.

The existing wallet service and core game engine/reward constants were reused. No second balance system or admin application was introduced.

## Cleanup and preserved folders

Removed confirmed-unreferenced `frontend/src/assets/react.svg`, `vite.svg`, `hero.png`, and `frontend/public/icons.svg`. The game's CSS/SVG interface artwork and favicon remain.

Removed obsolete private patch/debug scripts from `backend/.local/`: `add-integration-gateway.mjs`, `campaign-client.mjs`, `campaign-server.mjs`, `check-delivery.mjs`, `check-gateway-page.mjs`, `debug.mjs`, `extract-slider.mjs`, `finalize-config.mjs`, `organize.mjs`, `refine.mjs`, `update-docs.mjs`, `update-gateway-ui.mjs`. Their functions are covered by maintained source/tests or were one-time code-edit helpers.

Frontend, backend, shared, scripts, docs, e2e and backend/unit financial tests remain. Test scopes were retained because they verify distinct security/accounting/browser behavior. Generated reports, builds, dependencies, credentials and local storage are ignored. `backend/.local/mongo/`, private backups and PostgreSQL storage were preserved; PostgreSQL processes were present and their storage was not deleted.

## Data preservation

An application-wide private local snapshot was taken before migration. Comparison verified every original field of the pre-upgrade User, Wallet, WalletTransaction, Payment, Purchase, GameScore, GameSession, UserAchievement, UserEntitlement, UserGameProgress, UserProfile and CoinPricingConfig records. None was changed or missing; additive fields were allowed. This included 22 accounts/wallets, 14 payment records, 10 ledger entries and 15 game sessions. Empty collections were retained.

Atlas received a separate empty-database snapshot before initialization. The owner explicitly chose a fresh Atlas installation, so local history remains in its original database/backup. Database tests use distinct `_test` databases and never derive their default target from the application's live URL.

## Validation and limits

Latest checks are recorded in [VALIDATION.md](VALIDATION.md). Coverage includes all game engines, signed payment verification, mismatch/duplicate rejection, local verification isolation, free access, preview expiry/rewards, price snapshots, explicit billing, refresh/recovery, overspending, refunds, permanent ownership, admin changes, role protection, reporting and financial trace retention on account closure.

Browser checks cover 320/375/430/768/1024/1366/1440/1920 widths across the suites, short screens and a 683×384 layout corresponding to a 1366×768 viewport at 200% zoom. This is layout-equivalent coverage; native browser-toolbar zoom and physical mobile devices were not separately certified. The browser runner uses isolated API/frontend ports 4011/5185 and test accounts; gateway requests are intercepted.

Remaining content limits include small fixed word/question pools and overlapping Number Rush/Number Trail mechanics. Replay validation protects accepted results, not proof of human play or offline copying of a browser engine. These are disclosed limits rather than hidden claims of stronger anti-bot protection.

## Deployment and GitHub

Use Node 24. A new machine uses `npm.cmd install`, `npm.cmd run setup`, then `npm.cmd run dev`. Build/typecheck commands prepare a missing or changed Prisma client; stop the API before regenerating a changed schema on Windows. Database credentials, gateway configuration, SMTP, origins and support settings are centralized in backend environment configuration. Keep only public frontend values in `VITE_` settings.

Before public launch: provision the owner, review/publish desired prices, configure SMTP/public HTTPS/Inquiry and token renewal, verify actual merchant callbacks/capture/reversal, finalize business policies and test deployment. Rotate merchant keys disclosed during development. The targeted source/history scan is not a replacement for an independent secret/security review.

For GitHub, review `git status`, ensure `.env`/`.local`/builds/dependencies are ignored, run the documented checks, and review staged files before committing. No commit, push, deployment or Git-history rewrite was performed by the agent. See [deployment](DEPLOYMENT.md) and the root README.
