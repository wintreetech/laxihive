> Current authentication behavior: production generates and refreshes Inquiry tokens automatically using MEMBER_ID and WORKING_KEY. No manually supplied TW_AUTH_TOKEN is required; it remains an optional override. Production verification remains server-to-server and fails closed when authentication or Inquiry is unavailable. Earlier launch observations below are historical.

## Launch-policy, settlement and footer upgrade - 27 October 2026

54 unit checks and 50 reported MongoDB integration checks passed. The 18 existing browser checks passed after responsive fixes; all six launch browser checks passed separately, covering persistent navigation, mobile focus/dismissal, footer image, optional verification/reactivation, two-admin settlement, and rejection of an unfulfilled display-only paid status. TypeScript, ESLint, both production builds and generated Netlify proxy output passed. Native 200% browser-toolbar zoom was not separately certified; short and equivalent reduced viewports were checked.

A read-only ECB endpoint check confirmed the documented response shape. The targeted source/history scan checked 136 candidate files and two history revisions with no findings. Sixteen frontend build text files contained none of the configured backend secrets. All financial tests used isolated local databases and fake gateway transports. No real card charge or hosting deployment was performed.

Before additive Atlas migration 005, a private snapshot of all 26 original collections was saved. After migration, 100 original records were compared: missing=0, changed=0 (excluding migration bookkeeping/new fields). Existing local data and backups remain intact. The actual local app reports healthy API, optional customer verification, 20 games, zero paid starter modes, independent pricing and EUR merchant checkout. See [LAUNCH_UPGRADE.md](LAUNCH_UPGRADE.md) for full status and remaining owner/provider configuration.

## Two-folder reorganization - 27 October 2026

The root now contains only frontend and backend application folders (plus hidden Git metadata). Dependencies and lockfiles are separate. Shared game code, scripts, documentation and private local database/backups were relocated under backend; browser tests and frontend tools are under frontend. Database contents and environment values were preserved.

Validation: 50 unit checks, 40 MongoDB integration checks, and all 18 browser checks passed; both production builds, TypeScript and ESLint passed. Development servers started from their own folders. Starting the frontend or combined command a second time reused the running servers and exited successfully. Windows browser fixture processes were explicitly stopped after all checks completed. At the owner's request the frontend was then stopped; the API was left running. No real charge, production deployment or SMTP delivery was performed.

# Latest upgrade validation — 27 October 2026

The configurable pricing/session release was checked with 49 unit tests, 40 reported MongoDB integration tests and 18 browser tests. Focused navigation checks additionally covered wallet/game/admin layouts and short/zoom-equivalent viewports after typography changes. TypeScript, ESLint, backend/frontend builds and targeted source/history scanning were also run. Final command results are summarized in the handoff report.

All database test fixtures are isolated from the application database. They default to local `_test` databases even when the application uses Atlas. Atlas was kept fresh by owner choice; TLS-verified schema/catalog initialization was separate from financial tests. Native local pre-upgrade account/financial/game records were compared against the backup and retained unchanged.

No real charge, deployed production gateway callback, SMTP delivery, token renewal or Docker deployment was performed. Native 200% browser-toolbar zoom was not separately certified; equivalent reduced CSS viewport coverage was used. See [RELEASE_REVIEW.md](RELEASE_REVIEW.md) for readiness categories and remaining external requirements.

## Earlier implementation validation — 26 October 2026

The following checks passed against this implementation:

| Check                                      | Result                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                                 | 46 passed, including full/short gateway signatures, local checkout restrictions and USD/EUR prices                                        |
| MongoDB integration tests                  | 21 reported tests passed, including signed hosted returns and development-only email links                                                |
| Browser suite                              | 11 passed: guest game, signup/saved game/dashboard/settings/logout, hosted form handoff, all 20 game starts, seven viewport sizes         |
| Browser checks after folder reorganization | All 11 passed again                                                                                                                       |
| Current checkout browser checks            | 3 passed: signup/session/store, form POST, mobile/desktop USD/EUR selection                                                               |
| Live form configuration                    | Real app init and browser POST verified with supplied field names/mode/brand; external gateway request intercepted and test order expired |
| TypeScript                                 | Frontend/shared and backend passed                                                                                                        |
| ESLint                                     | Passed                                                                                                                                    |
| Production builds                          | Frontend and backend passed                                                                                                               |
| Dependency audit                           | 0 reported vulnerabilities                                                                                                                |
| Local readiness                            | Frontend HTTP 200 and proxied `/api/health` OK                                                                                            |
| Simplified startup                         | Setup completed, local MongoDB started automatically, separate frontend/backend commands and combined launcher verified                   |
| Frontend port configuration                | Signup, persisted session, saved game, settings and logout passed at port 5174; CORS and CSRF use the same origin; `.env` reload verified |
| Secret isolation                           | Supplied working key absent from all 30 frontend output files; backend `.env` ignored by Git and Docker                                   |
| Patch whitespace                           | `git diff --check` passed                                                                                                                 |

Responsive checks covered 320, 375, 430, 768, 1024, 1440 and 1920 pixels across the homepage, catalog, coin store, signup, game intro, daily challenge, leaderboards, expansions and policy page. No document-level horizontal overflow was found. Desktop/mobile screenshots were inspected. Browser interaction checks use installed Chrome.

Integration coverage includes real MongoDB persistence, transaction retries, cookie/CSRF handling, normal-user admin rejection, email token consumption, all 20 game completions, repeated-completion rejection, daily reward caps, guest-import isolation, sequential campaign stars, payment quotes, duplicate/concurrent Stripe events, delayed refund events, Transactworld checksums/inquiry/duplicate notifications/reversals, atomic unlocks, concurrent overspending and password-reset session revocation.

Gateway HTTP responses and browser gateway navigation are **test transports**. They exercise application behavior without making charges. No external live Transactworld charge, actual Stripe-hosted payment, SMTP delivery or deployed production infrastructure was tested. Docker image execution was not verified because Docker Desktop’s engine was stopped; database tests used an installed native MongoDB replica set instead.

Standard Checkout is enabled for local browser-return testing with the supplied live merchant configuration. Both currencies use 100 coins per unit. The Inquiry token is optional; a full-status signed capture return can fulfill an order once. Production still requires public HTTPS callbacks, merchant currency support and a real external payment/notification check. These local tests do not certify a production launch.

Email verification checkout was checked in the browser: signup, local verification, return to the selected EUR amount and hosted form POST. The external request was intercepted; no charge was submitted. Production responses were tested to exclude development verification links.

New merchant checkout: actual Transactworld EUR 5.00 customer-entry form opened with DB / CC / VISA and no account ID. The same USD request returned error 30101; the old numeric mode returned Invalid payment mode. No customer/card details were filled and no charge was submitted. EUR checkout is enabled; USD checkout is guarded. Four focused browser tests passed, covering signup/settings, USD/EUR display, local verification through the hosted POST, and merchant-currency defaults. The signed-return credit and repeat-delivery behavior passed in the isolated MongoDB integration suite.
