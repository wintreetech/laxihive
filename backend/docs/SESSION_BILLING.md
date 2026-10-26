# Trials, session billing and recovery

## Start and consent

Free guest gameplay first checks the backend catalog for visibility and current free access. Signed-in gameplay creates a server session with a stable request UUID. The session records user, game, mode, level, seed, access type, agreed price, pricing version, preview duration and full-attempt duration. Prices are never accepted from the browser as authority.

Session creation does not debit coins. A ready request starts the server clock after the game page/module is loaded. Paid sessions require explicit authorization before the ready request. The browser displays the price, balance and billing unit, and confirms the charge. The authorization API checks consent against the saved snapshot, email verification, ownership, wallet balance and debt, and performs the ledger debit and authorization in one transaction.

The billing unit is **one attempt**: a win, loss, abandonment or timeout consumes the started session. No recurring charge or automatic renewal exists.

## Preview

Eligible signed-in users receive one practice preview per game/mode per UTC day. A unique TrialGrant prevents refreshes or new request IDs from creating another free period. A ready request sets server-side trial timestamps; subsequent ready requests never reset them. The browser uses a monotonic clock, resynchronizes with the API, and disables the game at expiry. The server independently rejects expired completion or unauthorized paid completion.

When time expires, the preview pauses. The user can confirm the saved coin price, buy coins, or exit. Explicit purchase restarts the board as a fresh full attempt; trial moves are not imported into a rewarded result. Practice results award no points, XP, progress, streak or achievement coins. Normal FREE_FULL rewards remain available.

These controls protect server authorization, saved results and wallet accounting. A client-side puzzle engine cannot prevent someone copying browser code and playing it offline; replay validation is not proof of human play or strong anti-bot protection.

## Lifecycle

| State                        | Meaning                                        |
| ---------------------------- | ---------------------------------------------- |
| LEGACY                       | Historical sessions remain compatible          |
| CREATED                      | Free/preview request, not ready yet            |
| PAYMENT_REQUIRED             | Full session awaits consent                    |
| TRIAL_ACTIVE / TRIAL_EXPIRED | Server-enforced practice period                |
| PAYMENT_AUTHORIZED           | Charged exactly once, waiting to start         |
| ACTIVE                       | Ready and within the agreed full-attempt limit |
| COMPLETED                    | Replay-validated result recorded               |
| ABANDONED                    | Customer exited                                |
| EXPIRED                      | Offer or active authorization ended            |
| REFUNDED                     | Unstarted charge returned through the ledger   |

API responses compute expiration immediately; maintenance also persists expired states. Old state stored between maintenance ticks never authorizes expired gameplay.

## Refresh, disconnections and refunds

The browser caches only the attempt ID and actions, not authentication tokens or trusted prices. Refresh recovers the owned server session, its remaining time and the action replay. Paid authorization is tied to that exact user/game/mode/session and cannot fund another game. Repeated authorization/ready calls do not charge or reset the clock.

A paid authorization has a ten-minute launch window. If its ready request never succeeds, Cancel refunds its charge once. Maintenance refunds stale unstarted authorizations automatically. If the ready response is lost, the server retains the active attempt for recovery; the client must not purchase a replacement merely to retry the same request. Once a seed has been issued for an active attempt, arbitrary automatic refunds would allow free play; recover the attempt or use an audited support adjustment for a genuine client failure.

Background tabs and disconnects do not pause the authoritative session clock. A full result has a small network submission grace period; this is not reusable paid access. Long outages can exhaust an active attempt. No automatic renewal or second debit occurs.

## Endpoints

- `POST /api/games/:slug/sessions`: snapshot a new request; `requestId`, `difficulty`, `level`, `intent`.
- `POST /api/games/:slug/sessions/:id/authorize`: explicit saved-price/version consent.
- `POST /api/games/:slug/sessions/:id/ready`: start once or recover readiness.
- `GET /api/games/:slug/sessions/:id`: owned state, server time, remaining authorization.
- `POST /api/games/:slug/sessions/:id/cancel`: abandon or refund unstarted authorization.
- `POST /api/games/:slug/complete`: server replay and eligible full-game fulfillment.

All mutations require an authenticated session, the configured Origin and CSRF token. The legacy free-session endpoint is guarded against using old request formats to bypass newly published paid prices.
