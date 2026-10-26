# Administrator setup and operations

## First administrator

There is no public admin signup, default admin password or separate admin authentication database.

1. Start the app with `npm.cmd run dev` from the root.
2. Register the intended email through `/signup`. The owner selected `support@lexihive.com` for this installation.
3. Verify the account. In local development, Settings or the game/store verification control opens a one-use local verification link. Production requires working SMTP and email delivery.
4. Run from the repository root:

```powershell
npm.cmd run admin:provision -- --email support@lexihive.com
```

5. Refresh the browser and open `/admin`, using the same account/password.

The command requires a registered, verified, active account and zero active administrators. A database transaction serializes provisioning and records an `admin.bootstrap` audit entry. `ADMIN_EMAIL` is an optional command default. Seeding never promotes users.

The selected address was not registered during implementation; no account/password was invented. This step therefore awaits owner registration and verification.

## Panel sections

The existing `/admin` application has Dashboard, Users, Wallets & coins, Wallet transactions, Games, Game pricing, Trials & sessions, Premium expansions, Coin store settings, Payments, Analytics, Audit logs, Admin users & permissions, and Site settings.

Lists use real database values, search, filters and pages of 25 rows. User details show profile progress, wallet/debt, recent payments and sessions, achievements, permanent access and ledger activity. Historical detail lists are bounded; use the paginated central lists for larger histories.

## Coins

Select a user and choose Adjust coins, or enter their player ID in Wallets & coins. Choose Add, Deduct, or Set target available balance. Review available balance, debt, delta and resulting balance, provide a reason of at least 10 characters, and confirm.

All changes call the existing ledger inside a database transaction. Debits require sufficient available coins and zero debt. Credits repay debt before increasing available coins. Target corrections require zero debt and a matching balance/debt preview; a concurrent change requires refreshing the preview. Changes of 10,000 coins or more also require the administrator's password. Request IDs persist across ambiguous retries, and a key cannot be reused for a different adjustment.

An admin adjustment is never a provider-confirmed purchase and never changes payment success or revenue.

## Pricing

Game pricing shows published settings separately from editable draft values. Saving a draft is harmless to current customer pricing. Publishing requires a reason and a confirmation describing the exact mode and price. The expected published version prevents stale publishing. Audit logs contain the prior settings, new settings and actor. Existing sessions retain their snapshots.

Permanent expansion prices/availability are also configurable under Premium expansions. Existing ownership records are retained. Coin store settings control the separate USD/EUR rates and purchase bounds; merchant currency support is configured on the server, not assumed by the UI.

## Permissions

The implemented roles are USER and ADMIN. ADMIN grants access to management APIs; USER grants no administrative permissions. More granular finance/support roles are not exposed as pretend permissions. Ordinary users cannot assign roles.

Role changes and suspension/reactivation require the acting admin's password and a reason. The last active admin cannot be demoted or suspended, including concurrent changes. Suspending an account revokes its sessions; login is blocked. Further administrators are appointed from a user detail screen. API CSRF and role checks protect all changes.

Audit records are append-only through the application; no admin edit/delete API exists. A database administrator can still alter database records, so external audit retention and scoped production database permissions remain deployment responsibilities.

## Support

Set a valid complete address under Site settings or `SUPPORT_EMAIL` in `backend/.env`. Database settings take precedence when populated. The Contact page renders a mailto link; there is no ticketing backend. Two-hour wording is an optional aim, disabled by default. Configure it only when the business can support it. This setting does not configure SMTP.
