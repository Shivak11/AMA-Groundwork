# AMA-Groundwork 0.10.0 account-authentication candidate

Candidate date: 15 September 2026

## What changes

Version 0.10.0 adds open account registration and sign-in to the remote MCP connector. A user provides a name, email address and password on the AMA-Groundwork account page. The MCP client then uses OAuth 2.1 with PKCE to obtain an access token for the AMA-Groundwork `/mcp` endpoint.

Every remote MCP tool runs with the verified account identity. New workbooks belong to that account. `list_my_workbooks` allows the user to choose a saved workbook by group name and problem in a later conversation, after which `resume_workshop` continues it.

## Stored data

Cloudflare D1 stores:

- the user ID, name and email address;
- the password salt, password hash and work factor;
- hashed browser sessions, authorisation requests, authorisation codes, access tokens and refresh tokens;
- registered OAuth clients and recorded consent;
- each workbook's owner and account reference; and
- the existing workbook, revision, operation and file-ticket records.

Raw passwords and raw tokens are not stored. The secret used to derive new read-only workbook links remains a Cloudflare Worker secret because placing it in the same database would remove the separation it provides.

## Compatibility

The six-step workshop, MCP App resource, workbook format, PDF format, tool names and stable reading page remain unchanged. Existing `ws1_` private references can be claimed by the first signed-in account that presents them. The server returns a new account reference after the claim. Existing `wr1_` read-only links continue to open the same workbook. New workbooks use `wa1_` account references and `wr2_` read-only links.

The current 0.9.0 public connector remains active until this candidate is deployed and reviewed separately. The database migration is additive, but applying it to production and changing the live authentication policy are separate activation steps.

## Security controls

- OAuth protected-resource and authorisation-server metadata are published at the standard discovery paths.
- Dynamic client registration accepts public clients with exact HTTPS or loopback redirect addresses.
- Authorisation and token requests require the exact AMA-Groundwork resource address.
- PKCE with S256 is required.
- Access tokens last one hour. Refresh tokens last 90 days and rotate after use. Browser sign-in sessions last 30 days.
- Reusing an old refresh token revokes the related token family.
- Passwords use PBKDF2-HMAC-SHA256 with a unique salt and 600,000 iterations.
- The Worker returns HTTP 401 with the protected-resource metadata location before creating an MCP server for an unsigned request.
- Workbook ownership is checked in the D1 adapter as well as at the MCP request boundary.
- The account page loads no external assets and includes no analytics.

## Verification boundary

The exact candidate source completed these local checks on 15 September 2026:

- all 272 repository tests passed, including nine focused authentication, ownership, recovery and compatibility tests;
- the TypeScript check and repository diff check passed;
- five account-page states passed controlled Chromium inspection across desktop and mobile layouts in light and dark modes;
- a disposable local Wrangler Worker and local D1 database completed OAuth discovery, dynamic client registration, account creation, PKCE token exchange, authenticated MCP connection, workbook creation, account listing, workbook resumption, token revocation and the final HTTP 401 discovery challenge; and
- the Cloudflare Worker dry-run completed with the D1, Browser Rendering and six rate-limit bindings, producing a 3,093.55 KiB bundle before compression and 717.31 KiB after compression.

These local results do not prove Cloudflare D1 migration, live OAuth callbacks, ChatGPT sign-in, Claude sign-in or production replacement.

The first live test must use a separate Worker and D1 database. Production migration or replacement requires explicit approval after that preview is reviewed.
