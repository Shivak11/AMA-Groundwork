# Persistent workshop recovery

## Approved product decision

On 11 September 2026 Shiva authorised private Cloudflare session recovery. His subsequent explicit correction replaces the proposed seven-day expiry: workbooks must remain available for feedback and delivery three months later, with no automatic expiry. Store group names or aliases, answers, approvals and revision history until explicit deletion. The existing public connector endpoint is replaced in place after verification. No new paid service, employee integration or unrelated data collection is authorised. This supplements HOST-RELIABILITY-PLAN.md and supersedes its stateless-only boundary for this release.

The existing clean dedicated worktree is `/private/tmp/workshop-visual-rebuild.OuVbk8/chat-workbook`, branch `chat-workbook`, initial head `08f9ab3`. Existing source packages and failed actual-host tests remain intact. The installed Super-outer CLI and repository profile are absent; apply its relevant privacy, data, recovery and delivery guidance directly. No Git remote or CI exists; never describe local checks as CI.

## Required participant outcome

Keep the six-step group method, native-question preference and complete ordinary-chat fallback. Embedded cards remain read-only, lead with the actual step and its state, and preserve host light/dark styling. Preserve the Terracotta cumulative PDF and the complete group wording. A group can resume from its private reference after the host loses context or after several months. An earlier correction retains later answers for review. Confirmations save approval before attempting PDF generation. Every actual-host test must reach the six-step final PDF, including a correction and recovery; passing source or direct endpoint tests is insufficient.

The self-test remains Group 1A, Shiva and Chirag, managing a remote team without repeated chasing or micromanagement. Added operational details are fictional. Do not contact employees, inspect their systems, infer employee motivation, rank people or automate escalations.

## Storage and access contract

Use Cloudflare D1, not Worker memory or eventually consistent KV, as the durable source of truth. Keep the HTTP MCP transport stateless. `Mcp-Session-Id` remains a rendering-capability marker and never becomes group authorisation.

Use a server-generated 256-bit random write key (`ws1_` plus 43 base64url characters). Store only its SHA-256 lookup hash. Derive a separate read-only key (`wr1_` plus SHA-256 of a domain-separated write key, encoded base64url); store its lookup hash. Possession of the write key authorises that group's edits, exports and explicit deletion; the read key authorises only that group's reading and exports. No public listing, name search or account-wide enumeration. Do not log keys, request bodies, answers, generated file URLs or names. Platform backups are not an immediate-erasure promise.

The short tool reference is `{key, revision}`. Every normal stored-data tool resolves the server-owned record using this key. Never trust a caller-supplied full record as a replacement for an existing session. Raw version-1 JSON remains an explicit, consented import into a newly prepared session only. The same reference is repeated in successful and repair results; the full canonical record is supplied to the visual in `_meta`, not repeated in normal model-facing content.

Creation is a two-call handshake to avoid storing participant data under a key whose initial response was lost. The first `start_workshop` call prepares a random key and stores only its hashes and pending metadata; it returns that reference and instructs the host to call start again with the group details. The second activates the prepared reference atomically and saves revision 0. A lost second response can be retried with the key already returned by the first call. No group data is persisted by preparation. A repeated activation with identical original group details is idempotent; different details conflict. A deleted or unprepared key must never recreate a session.

Use one active session row, immutable full-record snapshots and operation receipts. Preserve the existing 150 KB record limit. Every effective save or approval creates the next revision. No-op saves keep the revision and approvals. An atomic database operation commits the current record, snapshot and retry receipt together. A trigger on the guarded head update is acceptable and avoids treating a zero-row CAS update as a failed batch. Two different writes at the same expected revision have one winner. Check a durable operation receipt before rejecting an old revision; same operation ID plus different payload must fail. Retry returns the saved outcome and the actual latest record without reapplying it or changing approval timestamps.

Explicit deletion checks the group access key and expected revision, then removes the active session, all snapshots, operation receipts and file tickets in one transaction. Old access keys and tickets subsequently fail. Downloaded files and copies retained by chat providers are outside this operation. No automatic expiry or purge applies to active workbooks or revision history.

## Locked adapter API

Implement `createD1SessionStore(db, {now, randomBytes} = {})` in `remote/d1-session-store.mjs`. Pure shared helpers are in `src/session-store.mjs`.

- `prepare()` returns `{key, revision:0}` and stores no group data.
- `activate(reference, group)` returns `{record, reference, replayed, appliedRevision:0}`. Validate the group and canonical revision 0. Same original activation retries return the current saved record without overwriting later work.
- `load(key, revision?)` returns `{record, reference, currentRevision}`. Omitted revision loads latest; supplied revision loads an immutable snapshot. The reference always identifies the authorised key and the loaded revision.
- `loadShared(readKey, revision?)` returns the same saved data without the write key.
- `transact(reference, {operationId, operationHash}, reducer)` checks receipts, loads the latest record, verifies expected revision, invokes a synchronous reducer on a validated copy, then atomically commits. Return `{record, reference, replayed, appliedRevision}`. The reducer must never perform network calls. Errors use stable `code` values `NOT_FOUND`, `PENDING`, `CONFLICT`, `OPERATION_CONFLICT` and do not include keys or private record text in their messages.
- `remove(reference)` deletes the authorised current session and every child record atomically. Confirmation of the user's intent and exact group name is enforced by the server tool before this call.
- `createFileTicket(key, revision, kind)` returns `{ticket, expiresAt}` for kind `pdf` or `json`. Tickets use fresh 256-bit random bytes and only their hashes are stored. They expire after 15 minutes; that expiry applies only to temporary file access, never the workbook. Retries are allowed before expiry and rendering failure does not consume a ticket.
- `resolveFileTicket(ticket)` returns `{record, kind, revision}` only while authorised session, snapshot and ticket still exist and the ticket is valid. No write credential is returned.
- `history(key)` returns bounded revision metadata for that group, not another group's records. Include revision and creation time, not whole snapshots by default.

Adapter amendment, acknowledged by the storage builder: `history` and `createFileTicket` accept either write or read-only keys without promoting authority. `getPreference(key)` reads `auto` or `text`; `setPreference(reference, mode)` requires a write key and expected current revision, persists session metadata without changing the workbook revision, and returns the loaded result. A dedicated preference tool persists this choice; read-only tools may override presentation for one turn without writing. Confirmation replay returns current context but its PDF links identify the original `appliedRevision`; later corrections must not be described as already approved.

Admission amendment: refuse new preparation beyond 500 pending/active sessions, effective revision beyond 1000, and more than 2000 operation receipts per session. Keep replays and reads available. A trigger-controlled conservative 200 MB logical budget counts UTF-8 heads/snapshots and row allowances. At most 256 unexpired tickets per group; only already-expired file tickets may be cleaned during new issuance. No active workbook, approval or history is purged for capacity. The private reader also offers authenticated direct downloads requiring no new database allocation, so months-later export does not depend on ticket admission.

Export `referenceSchema`, `readKeyFor(writeKey)`, `hashValue(string)`, `canonicalJson(value)` and a privacy-safe `SessionError` from the shared helper. Deterministic operation IDs may be derived from operation type, expected revision and canonical argument digest; callers may also pass a bounded request ID, whose payload digest must be checked.

## Server, model and file contracts

Add a persistent server module and route to it when a session store is provided. Preserve the legacy server as an explicit compatibility path for existing local consumers, never as an automatic fallback after database failure. The live Worker uses the D1 path and fails closed if its binding is missing. Persistent mutations have accurate write annotations; deletion is destructive. Read-only views, next-step reads and file exports remain read-only.

Keep the existing tool names wherever possible. Normal input carries a short record reference, plus the intended answer patch, approval or question preference. A stale write returns the latest reference and relevant stored wording for repair, never asks participants to reconstruct JSON. Historical rendering and file requests can name their snapshot revision, while conversation reads default to latest.

Short responses still expose the selected phase's saved answers and exact answer schema, current task/candidate IDs and relevant choices. Corrections of an earlier phase first load that phase's context. Add item-level array patches by stable ID (or revision-checked index for blockers), so changing one candidate cannot discard its siblings. Reject implicit removal of existing array items; explicit removal or replacement must be separately represented and validated.

Persist the participant's ordinary-chat preference with the session. Group approval remains an explicit conversational action. Never show the same question in native controls and an embedded form. On every meaningful visual, send the canonical full record in `_meta.workbook`, the short reference in `structuredContent.record`, and the latest current revision separately. The widget identifies the session by its stable key, not mutable group names.

Provide a stable private workspace URL with its read-only credential in the URL fragment, not a query or request path. The page reads the fragment locally and sends authorisation only in a same-origin request header. It contains no external scripts, fonts, analytics or requests and sets no-store/no-referrer/noindex protections. It can display the current workbook and historical versions, and offer actual PDF/JSON downloads. It does not collect workshop answers. Sharing this read-only URL does not grant editing or deletion. Give the group a separate private continuation reference for editing in another chat; treat it as confidential.

For chat delivery, `export_workbook` and confirmations return actual temporary HTTPS file links backed by revision-bound tickets. Do not put large base64 blobs in ordinary model output. The old file-only tool may remain for compatible native downloads, but the ordinary export must not depend on its discovery. Validate all served PDFs and preserve network-blocked rendering and existing request/PDF limits. A generated PDF is distinct from a successful participant download.

## Activation and recovery

The previously approved replace-current choice remains settled. Add a write-disable configuration that leaves stored-data reads and exports available. Keep the global existing disable switch. Code rollback must not delete D1 records or silently treat references as old full records. Before returning to the stateless release, export the affected records or retain the persistent reader; rehearse the read-only recovery path. Apply additive SQL migrations only after local SQLite and local Worker verification. Do not remove the database during rollback.

Host caches are an installation gate: verify actual tool input definitions and persistence after a page reload, not only a transient settings view. Supported refresh failed in the prior Claude registration; repair or reinstall the same in-scope connector if necessary, preserving conversations and recording the previous configuration. Do not bypass authentication or permission controls.

## File ownership

The orchestrator owns this plan, `src/persistent-server.mjs`, shared server integration, `src/server-core.mjs`, `src/server.mjs`, `src/widget.mjs`, inline view/types/CSS, workspace page files and build scripts, `remote/worker.mjs`, `remote/assets.mjs`, `remote/access.mjs`, `wrangler.jsonc`, package files, documentation/skill contracts, integration scripts, deployment and all actual-user-browser work.

Storage builder owns only `src/session-store.mjs`, `remote/d1-session-store.mjs`, `migrations/0001_workshop_sessions.sql`, `tests/session-store.test.mjs` and `tests/support/d1-sqlite.mjs`. Use real SQLite in Node tests through a small D1-compatible wrapper. Do not modify remote routing, configuration or server contracts without a written ownership amendment.

Test builder owns only `tests/persistent-host.test.mjs` and `examples/persistent-remote-team.mjs`. Test the persistent MCP contract, complete six-phase case, short reference recovery and corrections. Coordinate adapter availability; do not edit production files or old tests to manufacture a pass.

Subsequent acknowledged assignments: after freezing storage files, the storage builder owns only `scripts/verify-persistent-browser.mjs` for controlled local-browser verification. After freezing its first tests, the test builder separately owns `tests/persistent-routes.test.mjs` and then `tests/persistent-review-regressions.test.mjs`. Neither may edit production files or use the actual user's browser. The orchestrator retains deployment and actual-host ownership.

Reviewer is read-only and attempts to disprove access isolation, state integrity, retry handling, deletion, file access and rollback claims. A fresh exact-head independent review is required before production-proof claims.

All agents read this committed plan. They are not alone: preserve other changes. Stat owned files before the first write; at an unexpected mtime advance, immediately copy the foreign file and git diff to a temporary snapshot, stop and report. A changed assignment requires acknowledgement before the next write. Root verifies all tests and critical diffs from disk, audits full status and narrow staging, and commits verified units immediately.

## Verification obligations

1. Real SQLite tests: prepared-start response loss stores no participant data; activation replay; process restart; distinct session isolation; a 100-day simulated time advance retains records; concurrent different saves have one winner; identical lost-response approval retries preserve timestamp; operation-ID payload mismatch fails; snapshot and receipt failures roll back; no-op retains revision.
2. Deletion removes every active child and invalidates old edit/read keys and tickets. Unknown/deleted keys never create a session. SQL is parameterised and sizes are bounded. App deletion does not claim to erase provider backups or downloaded files.
3. Full persistent MCP six-phase remote-team test, native question guidance and text preference, missing-field repair, short-reference resumption, item-level candidate correction, group-name correction, preservation/review of dependent phases, and no premature approval.
4. PDF failure after saved approval; retry without reapproval; old-revision ticket after newer feedback; ticket expiry without workbook expiry; failed-render retry; read-only link cannot edit or delete. Real PDF signature, text, A4 layout, fonts and annotations.
5. Build, typecheck, all old and new tests, controlled widget/workspace browser checks in both themes and narrow widths. Inspect real rendered pages and establish zero answer forms, duplicate questions, clipping or uncontrolled network calls.
6. Additive D1 migration, deployed source/version and browser bundle hash, real endpoint canaries with fictional groups, explicit test-data cleanup and read-only containment checks. Keep source, installation, endpoint, actual-host and file-receipt proof separate.
7. Actual Claude and ChatGPT six-phase journeys using Group 1A, a correction and a fresh-chat resume from the stored reference. Retrieve the actual final PDF in each host. Refresh the screen-by-screen review with honest evidence boundaries. The full goal remains unachieved until these gates pass.
