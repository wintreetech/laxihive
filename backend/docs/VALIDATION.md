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
