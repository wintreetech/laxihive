# Environment settings

`backend/.env.example` contains the application's core settings. `backend/.env` is private and must not be committed.

## Pause and enable purchases

`PAYMENTS_ENABLED=false` blocks all new checkouts on the server and disables the store purchase button. Games, existing wallet balances, policy pages and price browsing continue to work. Verified notifications for existing orders still process so a pause cannot strand an already completed payment.

When the merchant account for this website is approved:

1. Enter its `MEMBER_ID`, `WORKING_KEY` only. The backend generates and refreshes verification tokens automatically from those two credentials. Use the account issued for this website.
2. Set `TW_SUPPORTED_CURRENCIES` to merchant-approved currencies, e.g. `USD,EUR`. Both are implemented; the preceding environment restricted checkout to `EUR`.
3. Set `PUBLIC_API_URL` to the public HTTPS backend URL, `APP_ORIGIN` to the HTTPS frontend origin and `NODE_ENV=production` on the host. Callback paths are derived automatically.
4. Set `PAYMENTS_ENABLED=true` and restart/redeploy the backend. Credential, callback, pricing and currency checks still apply. Turning the flag on with incomplete settings does not enable purchases.

Render uses the service's Environment settings; editing a laptop's `.env` does not change Render. Set the same flag to `false` in Render and redeploy to pause deployed purchases.

Customer-facing provider branding has been replaced with generic checkout language. Internal protocol values, approved gateway hostnames, callback routes and stored provider identifiers remain unchanged for verification and historical wallet compatibility.

## Optional settings

Add these only when the corresponding feature is used. They remain supported by the code.

| Capability | Optional settings |
| --- | --- |
| Email delivery | `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` |
| Separate test database | `TEST_DATABASE_URL`; never point it at the application database |
| Exchange-rate pricing | `COIN_BASE_CURRENCY` (default EUR), `FX_PROVIDER=FRANKFURTER_ECB`, `FX_RATE_CACHE_TTL_SECONDS` (default 3600), `FX_MAX_RATE_AGE_SECONDS` (default 604800) |
| Scheduled maintenance | `PAYMENT_MAINTENANCE_MODE=scheduled`, `PAYMENT_RECONCILIATION_SECONDS` (default 60), `PAYMENT_RECONCILIATION_ENABLED` (default true) |
| Alternate provider | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_AUTOMATIC_TAX`; existing integration accepts test Stripe keys only |
| Merchant-specific protocol overrides | `TO_TYPE`, `LANGUAGE`, `TW_GATEWAY_ORIGIN`, `MERCHANT_REDIRECT_URL`, `NOTIFICATION_URL`; use only when required by actual merchant instructions |

Default card routing is `PAYMENT_MODE=CC`, `PAYMENT_BRAND=VISA`; use the mode and brand configured for the merchant. The server derives the customer IP, language and callback paths. Fixed `IP`, redundant default `TO_TYPE`/`LANGUAGE`, and empty callback overrides are unnecessary in the normal `.env`.

The preceding local environment was saved privately in ignored `backend/.local/backups/merchant-pause/`. Database and session settings were preserved.

## Automatic merchant authentication

Production calls `/transactionServices/REST/v1/authToken` using `authentication.memberId` and `authentication.sKey` (the working key), caches the returned token in memory for 55 minutes and renews it early. Inquiry retries once after an HTTP 401/403 with a freshly generated token. Authentication or verification failure leaves payment pending; it never fabricates success. Production still requires authoritative Inquiry confirmation. `TW_AUTH_TOKEN` remains an optional manual override for existing installations, not a required setting. Merchant API access must be enabled by the provider. No real merchant authentication or payment was performed during this change.
