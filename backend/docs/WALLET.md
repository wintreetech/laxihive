# Wallet accounting

The existing Wallet, WalletTransaction and wallet service remain authoritative. Related writes use MongoDB transactions on a replica set. Do not fix a wallet by editing `Wallet.balance` or `Payment.status` in Compass.

| Existing/new kind        | Purpose                                | Durable reference                 |
| ------------------------ | -------------------------------------- | --------------------------------- |
| purchased                | Verified gateway coin fulfillment      | Provider + payment ID             |
| earned                   | One-time achievement award             | User + achievement                |
| spent                    | Permanent expansion                    | User + unlock                     |
| game_session_charge      | Explicit full-attempt authorization    | `game-session:<sessionId>`        |
| game_session_refund      | Unstarted authorization refund         | `game-session-refund:<sessionId>` |
| admin                    | Audited credit/debit/target correction | `admin:<requestUuid>`             |
| refund / refund_recovery | Verified payment reversal/recovery     | Provider event/reversal reference |

Each row stores signed amount, resulting balance, resulting debt, description and timestamp. A unique reference makes retries idempotent. Authorization and wallet changes commit together; concurrent purchases cannot overspend. Available balance never becomes negative.

Payment reversals can create debt if previously purchased coins were already spent. Normal debits require sufficient available balance and zero debt. Future credits settle debt first. An administrative target correction cannot quietly erase debt. Purchased and promotional coins share a wallet but retain ledger origins; no coin expiration, transfer, cash redemption or withdrawal is implemented.

The Wallet UI separates purchased credits, achievement earnings, net session spending and permanent unlock spending. Transaction history includes every operation type and shows debt adjustments. Account closure anonymizes the user and removes personal game scores while retaining billed-session/ledger/payment references; unstarted charged sessions are refunded once.

Existing CoinPricingConfig controls independent USD/EUR rates and bounds. This installation retains 100 coins per unit, 5–500 units in steps of 5, and EUR merchant checkout. Published-session examples in the store come from live server prices, never unpublished proposals. Coins spent in games are usage, not real-money revenue.

## Backup and migration

`npm.cmd run db:backup` writes a private Extended JSON snapshot under ignored `backend/.local/backups/`. Keep backups private: they contain account and financial data. For production, use managed database backups and test restoration to a separate database. The snapshot command does not provide an automated destructive restore.

Migration 004 adds account status and billing snapshots to old sessions and adds GameAccessConfig, TrialGrant and SiteSettings. Old sessions remain LEGACY; original scores, balances and entitlements remain unchanged. Seeding adds free configurations and unpublished proposals without resetting existing configuration.

Do not remove empty collections merely because they have no rows. Never delete `backend/.local/mongo/`. PostgreSQL data is outside this application's current MongoDB workflow and was deliberately retained.
