# Transactworld Standard Checkout

The app uses the Standard Checkout form flow supplied in the merchant guide: initialize an order on the backend, generate the MD5 checksum there, then POST a hidden browser form to `/transaction/Checkout`. Card details are entered on Transactworld's page.

## Current local setup

The live merchant credentials remain in ignored `backend/.env`. The app prices USD and EUR separately at 100 coins per unit, with a 5-500 purchase range. The new merchant's actual EUR customer-entry page was opened successfully; USD returned error 30101 before displaying the form. This installation therefore enables EUR checkout and defaults the store to EUR. USD prices remain available for viewing, and USD checkout is guarded until its merchant route is confirmed.

The hosted request includes `paymentType=DB`, `paymentMode=CC`, and `paymentBrand=VISA`. It does not require or send an account ID. Every purchase receives its own unique transaction ID. Legacy `1` / `VISAs` configuration is normalized to the documented `CC` / `VISA` values.

`TW_AUTH_TOKEN` is **required for production checkout and independent fulfillment**. It belongs to the documented Backoffice Inquiry API. Development/test may open hosted checkout and exercise a full-status signed return without it; that fallback is disabled in production.

```dotenv
PAYMENT_PROVIDER=transactworld
TW_ENVIRONMENT=live
PAYMENTS_ENABLED=true
PAYMENT_BRAND=VISA
PAYMENT_MODE=CC
TW_SUPPORTED_CURRENCIES=EUR
TW_AUTH_TOKEN=
TW_ALLOW_LOCAL_CHECKOUT=true
PUBLIC_API_URL=http://localhost:4000
MERCHANT_REDIRECT_URL=
NOTIFICATION_URL=
```

`TW_ALLOW_LOCAL_CHECKOUT` permits localhost callbacks only outside production. A customer's browser can POST the return to the same laptop's localhost. Transactworld's servers cannot deliver notifications to that address. This supports checking the hosted page locally; it does not establish that the merchant will accept every local address or IP. The development `IP` override is used only with this explicit local setting. Production always uses the request IP.

For production, set `NODE_ENV=production`, `TW_ALLOW_LOCAL_CHECKOUT=false`, and `PUBLIC_API_URL` to your public HTTPS backend. Leave the two callback overrides blank to derive the correct routes. Production rejects localhost even if the local setting is accidentally left true. Confirm USD and EUR availability on the merchant account before accepting customers.

## Checksum and confirmation

The supplied guide distinguishes two signatures:

```text
Request:      MD5(memberId|totype|amount|merchantTransactionId|merchantRedirectUrl|workingKey)
Hosted return: MD5(paymentId|merchantTransactionId|amount|status|workingKey)
Notification: MD5(paymentId|merchantTransactionId|amount|shortStatus|workingKey)
```

The return route verifies the **full status** checksum, exact order reference, amount, currency and provider payment ID. In development/test, a signed capture can fulfill an order without Inquiry. Production requires authenticated Inquiry confirmation; a browser return alone cannot fulfill it. Preauthorization, pending and unknown statuses never credit coins. Concurrent delivery uses the same transactional ledger reference.

A short notification `Y` alone does not prove capture. A signed notification binds the gateway payment ID and stores sanitized fields. With an Inquiry token, the server independently verifies capture, transaction references, amount and currency. This path does not depend on keeping the browser open. Production checkout remains unavailable without this credential.

## Automatic recovery and remaining merchant dependencies

Set an operational `TW_AUTH_TOKEN`, `NODE_ENV=production`, and public HTTPS return/notification routes before accepting production payments. `TW_ALLOW_LOCAL_CHECKOUT` is ignored in production. Optional `TW_GATEWAY_ORIGIN` must match the documented selected live/sandbox origin.

The API starts maintenance automatically. `PAYMENT_RECONCILIATION_ENABLED=true` enables provider checks; `PAYMENT_RECONCILIATION_SECONDS=60` is the default interval (30–3600). Each batch checks up to 100 eligible orders from the last 30 days, oldest verification first. `npm.cmd run payments:reconcile` remains available. Verification failures retry later and never guess success.

Orders with no provider payment ID after 24 hours are locally labeled abandoned, not paid. Late verified notifications can still settle them. If neither notification nor return supplies a provider ID, PID Inquiry cannot identify the payment: investigate its merchant transaction reference in the gateway dashboard/support. Merchant-ID Inquiry is documented but needs account/signing-contract confirmation before enabling another recovery variant.

This installation has no Inquiry token, deployed public HTTPS callbacks or tested token-renewal credentials. Provider documentation describes short-lived authentication tokens. Supply operational authentication/renewal details before claiming unattended recovery. Refunds and chargebacks require authoritative cumulative amounts; unsigned totals never debit wallets. No cash-refund initiation UI was added. No real charge was made during this upgrade.

The provider's documented hashes do not include currency. The app compares the returned currency to the immutable quote; when Inquiry is configured it also checks the independent authenticated gateway response. Use Inquiry for independent amount/currency reconciliation and refunds/disputes. Unsigned refund totals are never used to debit a wallet. The working key is never included in the browser form.

## Routes

- `POST /api/payments/init` (or `/checkout`): initialize an owned quote.
- `POST /api/payments/forward/:transactionId`: signed server notification; the previous `/api/pricing/forward/:transactionId` alias also works.
- `POST /api/payments/transactworld/return/:transactionId`: validate the hosted response, then redirect to the frontend status screen.
- `GET /api/payments/transactworld/return/:transactionId`: display the current state without changing financial data.
- `POST /api/payments/:id/reconcile`: optional authenticated Inquiry for an owned payment.

Run `npm.cmd run payments:check` to inspect settings without submitting a charge. Unit and MongoDB tests exercise signatures, preauthorization, duplicate delivery, EUR/USD mismatches and refund reconciliation. Browser tests intercept the gateway POST; they do not charge a card or claim a real merchant transaction succeeded.

Reference: [Transactworld Standard Checkout](https://docs.transactworld.com/integration/standard-checkout.php).
Also reviewed: [Backoffice Inquiry](https://docs.transactworld.com/integration/backoffice.php) and [transaction authentication](https://docs.transactworld.com/integration/transaction-AuthToken.php).
