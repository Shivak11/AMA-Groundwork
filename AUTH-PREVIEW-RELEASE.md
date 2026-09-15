# AMA-Groundwork authentication preview

The separate authentication preview is live as of 15 September 2026.

MCP address: [Connect to the authentication preview](https://ama-groundwork-auth-preview.shiva-research11.workers.dev/mcp).

The existing public connector and its participant database have not been changed. This preview uses email-and-password accounts, OAuth with PKCE, and account-owned workbooks in its own Cloudflare D1 database.

## Deployed version

| Item | Verified value |
| --- | --- |
| Repository | `Shivak11/AMA-Groundwork` |
| Branch | `account-auth-20260915` |
| Deployed source | `c338a20749d3a5d3b9d7df2128a6bf2268c22ada` |
| Worker | `ama-groundwork-auth-preview` |
| Worker version | `800a0ed5-9f13-4bd5-8d5b-d21ee064346a` |
| Database | `ama-groundwork-auth-preview` |
| Database ID | `5d171b2f-de1d-4a4c-8b05-e1a4132b60bf` |
| Configuration | `wrangler.preview.jsonc` |
| Applied migrations | `0001_workshop_sessions.sql`, `0002_account_auth.sql` |

The deployed source was clean and matched the pushed GitHub branch. The account-link secret was generated and sent directly to Cloudflare; its value is absent from source, local files and test evidence.

## Verification

The live run at 08:04–08:05 UTC completed 16 checks through the deployed Worker and remote D1 database:

- anonymous MCP access was denied with the OAuth discovery challenge;
- two synthetic accounts completed registration and PKCE;
- all 16 MCP tools and the exact built MCP App resource were returned;
- a second account could not list, reopen or change the first account's workbook;
- each of the six workshop steps was saved and approved;
- an incorrect password was rejected;
- a fresh sign-in and client recovered the complete workbook;
- the final PDF downloaded successfully;
- the reading link opened the workbook and could not be used for editing;
- reuse of a refresh token revoked that sign-in family; and
- revoked access was denied immediately.

Reproduce this synthetic-data test with `node scripts/verify-auth-preview.mjs`. It is fixed to the preview address and retains only the fictional test workbooks it creates. It does not touch participant records. The local evidence is in `output/auth-preview/evidence.json`; no passwords or tokens are logged there.

The final PDF is 363,927 bytes, has 22 A4 pages and selectable text, and has SHA-256 `778320038f8d38e158479d59343791a9e2d66ce1d39d88e6918a63266c08ed00`. The cover, summary, workflow comparison and final-page checks are separate from authentication checks. Profile hyperlinks were enumerated from the PDF.

All 276 repository tests passed before the final response-header correction. All 13 focused authentication tests passed again at the deployed head, and a separate read-only verifier independently reran those tests and checked the saved PDF checksum. TypeScript and the Worker build passed. No GitHub Actions run is claimed.

## Native Claude check

Claude discovered the OAuth settings and registered its client automatically. The live account page opened from Claude. Cancelling an empty registration form returned to Claude with the expected cancellation result. A subsequent synthetic account registration returned to Claude successfully.

A read-only aggregate query in the preview database confirmed one completed authorisation-code exchange and one issued access token for that synthetic Claude account. Final inspection of the connected status and a new Claude conversation was blocked by browser permissions. Those checks, and native ChatGPT sign-in, remain unverified. The SDK run is not presented as a substitute for a native-client conversation.

## Corrections made during verification

The initial Cloudflare registration attempt failed before creating a user. Cloudflare's native PBKDF2 limit was incompatible with the configured 600,000 iterations. Password derivation now uses pinned `@noble/hashes` version 2.4.0 with the same algorithm, salt, iteration count and output format. A regression test compares its full-strength result with Node's native PBKDF2 output. Existing password records remain compatible.

The browser test also caught a form-submission failure caused by `Referrer-Policy: no-referrer` producing a null Origin header. Account HTML now uses `same-origin`; the callback response continues to use `no-referrer`. The strict same-origin POST check remains in place, and the page permits the validated registered callback origin in its form policy. Cancel bypasses account-field validation.

## Remaining limits before wider release

- Password-reset email and email-address verification are not included. An email address is an account identifier, not a verified identity claim.
- The authentication rate limit is 30 requests per minute per connecting IP. Simultaneous classroom sign-in behind one shared network has not been load-tested and needs adjustment before classroom rollout.
- Native ChatGPT and Claude conversation checks remain as described above.
- The dependency audit reports six inherited high-severity findings through the browser installer and local Miniflare image dependency. The bounded review found no corresponding request path in the Worker bundle. This does not mean the complete dependency installation is vulnerability-free; no forced downgrade was applied.

The preview is suitable for the approved review, not yet a certified classroom-wide replacement. Existing participant workbooks remain on the current public connector.

## Recovery

If a preview-only defect requires stopping access, set `WORKSHOP_ENABLED` to `false` in a preview deployment using `wrangler.preview.jsonc`. Retain its D1 database and account-link secret so the saved work can be recovered. Do not use the production configuration for this operation. Do not rotate or remove the account-link secret during recovery, because existing reading links depend on it. No production rollback or participant migration has been exercised or is claimed.
