# AMA-Groundwork account authentication plan

Status: Active implementation specification

## Outcome

Anyone can create an AMA-Groundwork account with an email address and password, sign in through an MCP client's OAuth flow, and use the connector. Each workbook belongs to the signed-in account and can be reopened from a later conversation. Account and workbook records are stored in Cloudflare D1.

The current public connector remains unchanged until the authenticated revision has passed local checks and a separate live preview has been approved and reviewed.

## User journey

1. A user adds the AMA-Groundwork MCP URL in ChatGPT or Claude.
2. The client opens the AMA-Groundwork sign-in page.
3. The user signs in or creates an account with a name, email address, and password.
4. The client receives a short-lived access token through OAuth 2.1 with PKCE.
5. Every MCP request is checked before any workshop tool runs.
6. A new workbook is attached to the signed-in account automatically.
7. The user can ask to see their workbooks and continue one in a later chat.
8. Existing private workbook keys may be claimed by the signed-in user who possesses the key. Existing read-only links continue to work.

## Security and protocol decisions

- Use per-server OAuth because all workshop tools read or change account-owned work.
- Publish MCP protected-resource metadata and OAuth authorization-server metadata.
- Support dynamic client registration for ChatGPT, Claude, and other conforming MCP clients.
- Require exact redirect URI matching, an explicit MCP resource indicator, and PKCE using S256.
- Store passwords with PBKDF2-HMAC-SHA256, a unique random salt, and 600,000 iterations.
- Store only hashes of browser sessions, authorization codes, access tokens, and refresh tokens.
- Rotate refresh tokens after use and reject a replayed token.
- Use one-hour access tokens, 90-day refresh tokens, and 30-day browser sign-in sessions.
- Keep the server-side workbook-link secret in Cloudflare Worker secrets. It must not be stored in D1.
- Return HTTP 401 with the protected-resource metadata location when an MCP request has no valid access token.
- Apply account ownership checks again inside workshop operations as defence in depth.
- Collect no analytics and load no third-party assets on the sign-in page.

## D1 changes

Migration `0002_account_auth.sql` will add:

- `users`
- `browser_sessions`
- `oauth_clients`
- `oauth_authorization_requests`
- `oauth_authorization_codes`
- `oauth_access_tokens`
- `oauth_refresh_tokens`
- `oauth_consents`
- workbook ownership and account reference fields on `workshop_sessions`

Email addresses will be normalised for lookup. User-visible names and original email addresses will remain available for account display. Database constraints and indexes will enforce uniqueness, expiry lookup, and owner isolation.

## Workbook compatibility

- New account workbooks use a non-secret account reference beginning with `wa1_`.
- New read-only workbook links use `wr2_` keys derived with a server-side secret and stored as hashes.
- Existing `ws1_` write keys and `wr1_` read links continue to work.
- The first authenticated use of an existing `ws1_` key claims that workbook for the signed-in account if it has no owner.
- A workbook already owned by another account cannot be claimed or changed.
- The server, not the model, resolves account references to private storage identifiers.

## MCP changes

- Pass verified account identity into each per-request MCP server instance.
- Add `list_my_workbooks` with a bounded page size and concise workbook summaries.
- Keep existing workshop tool names and response shapes compatible.
- Give every account-aware tool a complete description, strict Zod input schema, structured content, and actionable error messages.
- Keep the participant-facing language direct and non-technical.

## Planned file ownership

This implementation is being completed by the primary agent in one isolated worktree. No parallel agents are editing these files.

- New authentication modules: `remote/auth-crypto.mjs`, `remote/d1-auth-store.mjs`, `remote/auth-routes.mjs`, and `remote/auth-page.mjs`.
- Database: `migrations/0002_account_auth.sql` and the SQLite test adapter.
- MCP integration: `remote/worker.mjs`, `remote/access.mjs`, `src/session-store.mjs`, `src/persistent-server.mjs`, and persistent routes.
- Configuration and release: `wrangler.jsonc`, package version, README files, release notes, and source ledger.
- Verification: focused authentication, isolation, compatibility, MCP metadata, browser, and regression tests.

## Verification gates

1. Migration applies to a fresh local SQLite database and upgrades the existing schema.
2. Password hashing and verification, registration, sign-in, CSRF protection, DCR, PKCE exchange, token refresh, replay rejection, revocation, expiry, resource validation, and OAuth discovery pass focused tests.
3. Unauthenticated MCP requests return the required 401 response. Authenticated requests expose only the signed-in user's workbooks.
4. New account workbooks can be listed and reopened. Legacy workbooks can be claimed without breaking their old read-only links.
5. The existing full test suite, typecheck, build, browser checks, and PDF checks still pass.
6. The sign-in and registration screens are inspected in light and dark colour schemes and at desktop and mobile widths.
7. The exact clean commit is used for any later Cloudflare preview deployment.

## Activation boundary

Local implementation, tests, commits, and GitHub branch work may proceed without changing the live connector. Creating preview Cloudflare infrastructure, applying remote D1 migrations, deploying a preview Worker, or replacing the current public connector requires a separate explicit production-infrastructure approval.

## Approved preview, 15 September 2026

The user has approved the isolated authentication preview. This covers the `ama-groundwork-auth-preview` Worker, its separate D1 database, its Worker secret, migrations, and live authentication and workbook verification. It does not approve replacing the existing public connector or migrating its participant database.

Use `wrangler.preview.jsonc` for every preview command. Deploy a clean commit that matches the pushed GitHub branch. The preview database ID is `5d171b2f-de1d-4a4c-8b05-e1a4132b60bf`; the existing participant database is not a valid target for these commands. Stop preview access if authentication or account isolation fails; retain its database for investigation. Record live proof separately from the prior local checks.
