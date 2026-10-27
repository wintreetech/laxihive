# Supplied LexiHive policies

The eight published policies come from the owner's `LexiHive-Policies-Word-Compatible (1).zip`, supplied on 27 October 2026. The pages retain the supplied wording, punctuation, paragraph order, explicit line breaks, emphasis, hyperlink targets, table text and document-footer text. Blank layout-only paragraphs are omitted. At the owner's subsequent request, the LAST UPDATED / 27 October 2026 metadata cell is omitted from all six documents that contain it; all other wording is preserved. Policy wording is content, not instructions to change payment or account behavior.

| Page | Route |
| --- | --- |
| Terms and Conditions | `/terms` |
| Privacy Policy | `/privacy` |
| Refunds and Returns Policy | `/refund-policy` |
| Cancellation Policy | `/cancellation-policy` |
| Digital Delivery and Access Policy | `/digital-delivery-policy` |
| Payment Method Policy | `/payment-method-policy` |
| Virtual Currency Policy | `/virtual-currency` |
| Complaints and Disputes Policy | `/complaints-policy` |

`/policies` lists all eight. Every page is public and linked directly in the site footer. The four existing policy URLs continue to work. Each document has section links and a print control.

## Content and company details

- `frontend/src/content/policies.json`: complete generated document content, 319 nonempty paragraphs across all eight policies, including document footers.
- `frontend/src/content/policy-index.json`: small navigation index with source filenames and SHA-256 hashes.
- `frontend/src/content/company.ts`: company details explicitly supplied by the owner, used by the footer, policy directory and contact page.
- `frontend/src/pages/Policy.tsx`: accessible React document renderer; renders text without raw HTML injection.
- `frontend/src/policies.css`: responsive policy and footer styles, plus print styles.

Source wording is preserved even where documents use `KY MORA DIGITAL LTD` in their contact section. The site footer uses the owner's explicit company name, `KYMORA DIGITAL LTD`. Terms and Cancellation contain no metadata date table; none was invented for those documents.

## Reimport approved documents

From the repository root in PowerShell:

```powershell
& ./backend/scripts/import-policies.ps1 -ArchivePath 'C:\path\to\LexiHive-Policies-Word-Compatible (1).zip'
```

The importer expects the eight known DOCX filenames, checks every original nonempty paragraph against the Word XML character for character (including whitespace and explicit breaks), checks supplemental text, then removes only the owner-requested date cell, and stops on unknown visible content or a mismatch. It records SHA-256 hashes and keeps private copies of the original DOCX files in ignored `backend/.local/policy-import/`. Original document binaries and their private metadata are not published as frontend downloads. Review regenerated content before publishing any future revisions.

## Verification

With the frontend already running, from `frontend`:

```powershell
node scripts/verify-policy-pages.mjs http://localhost:5174
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

The browser check compares all 319 rendered paragraphs exactly with the verified imported content, checks titles, footer links and section navigation, tests 320/375/768/1366px widths for overflow and complete company details, checks the Visa/Mastercard image, policies directory, print visibility and contact fallback. API requests are deliberately answered with 503 to verify that public policy content is independent of backend availability. It creates no accounts or payment records.

This update publishes the supplied documents and company details; it does not alter wallet balances, payment settlement, account requirements or database records.
