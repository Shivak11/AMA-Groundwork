# Verification record

## Visual rebuild candidate — 11 September 2026

Version 0.2.0 is an isolated local candidate. It has not replaced the canonical package, installed connector or public Worker. Historical Cloudflare and ChatGPT reports below describe version 0.1.0 and do not verify this revision.

| Layer | Current evidence |
| --- | --- |
| State and protocol | 59 Node tests pass. Existing v1 records work without interaction state. Tests cover revision fencing against the supplied record, bounded undo, strict references, explicit approval/refusal, corrections, pending decision reconciliation and text-only completion. The remote parser also accepts a valid multilingual record-plus-edit envelope exceeding the former 180,000-byte cap while rejecting requests above 350,000 bytes. |
| Actual local MCP journey | `scripts/verify-visual-journey.mjs` runs the returned self-contained widget in a sandboxed controlled host. Clicks and conversation fixtures use the real MCP tools. Six UI confirmations produce six actual cumulative PDFs; 15 captured screens include side-by-side/book views, a blocked context update and retry, priority reconciliation, earlier correction, 320/390 px reflow, dark mode and reduced motion. No external browser requests or runtime errors. |
| Transport | `scripts/verify-stdio.mjs` initialises the real stdio server with no UI capability, reads method resources, saves and confirms a phase, and receives a 103,655-byte actual PDF. |
| PDF and book | The fictional hiring example is nine A4 pages with selectable text, profile-link annotations on every page and no PDF JavaScript. Cover, each visual type, dense priority page, continuation pages and final recommendation were rendered to PNG and inspected. Named running Step labels remain visible on continuation pages. The book preview and PDF use the same composition. |
| Long answer and escaping | `scripts/verify-visual-long.mjs` retains a 1,101-character answer including literal script/image-like text in the actual PDF. It makes no external requests or script execution and has no horizontal overflow at 320, 390, 768 or 1280 px. Dependent chapters remain labelled for review. The eleven-page variant was inspected, including its two-page cover. This is a bounded stress case, not proof of every maximum-length combination. |
| Failure and recovery | Tests prove confirmation returns the accepted record if PDF generation fails, including simultaneous optional-preview failure. Re-export does not require approval again. Pending priorities cannot inherit conflicting reasons; changed zero-second task choices need renewed reasoning. UI recovery checks are recorded separately in the review evidence. |
| Browser recovery | `scripts/verify-widget-recovery.mjs` passes 12 checks against the actual bundled widget and controlled host/domain actions. These include failed context sync plus idle echoes, unsaved drafts/disclosures, blocked approval with unsaved wording, explicit conflicting-record choice, renamed group details, invalid references, no-op saves, duplicate pending replies, late replies and retained book document/scroll position. Save wording works without granting HTML form submission in the sandbox. No external requests or page errors. |
| Package | Self-contained widget builds. Cloudflare `wrangler deploy --dry-run` builds successfully with the Worker disabled/unconfigured; this performs no deployment. Official skill and plugin validators pass. No runtime Prefab import or additional participant MCP is required. |

The final local widget is 548,375 bytes. Remote dry-run output is 2,547.44 KiB before compression (542.28 KiB gzip). The recovery evidence records the exact widget SHA-256; the durable review package records its source commit and artifact hashes.

The local host deliberately controls conversation answers and simulates the MCP Apps bridge. It does not establish whether an actual model asks appropriate follow-up questions, whether Claude or ChatGPT keep a view beside chat, or whether their file controls deliver the PDF. The `downloadFile` capability is simulated in this harness; an actual host download is not claimed.

Record revisions protect a request against its supplied record, not a server-held global version. There is no participant database, authenticated group ownership, automatic cross-client resume or concurrent-copy merge. Keep one conversation and the latest view per group. Old v1 records have no immutable group identity; changed group details require explicit review in the view rather than silent adoption.

Remaining release checks: review the visual candidate with Shiva, test it in actual target Claude and ChatGPT clients, verify Cloudflare rendering/runtime under the intended configuration, and approve production activation separately. Classroom timing, assistive-technology testing, load and participant usability remain unproved.

## Historical local package — 8 September 2026

The Cloudflare adaptation and earlier release status are recorded in [remote/verification.md](remote/verification.md). Everything below concerns the previous local package and must not be read as current candidate verification.

Verified locally on 8 September 2026. Main implementation commit: `6547594`. The final-location verification scripts were subsequently corrected to decode paths containing spaces; application behaviour was unchanged.

## Proved locally

| Layer | Check and result |
| --- | --- |
| State and protocol | `npm test`: 17 passing checks. These include six-phase text-only completion, unknowns, no-pilot completion, immutable saves, ordering, correction/reapproval, stale task references, valid priorities, chosen-workflow consistency, explicit refusal, manual restore, renderer failure/retry and UI preference detection. |
| Real MCP transport | `node scripts/verify-stdio.mjs`: stdio initialisation, resource listing/reading, draft save and a real phase-1 PDF response passed. The final response contained 92,917 PDF bytes and a confirmed phase. |
| PDF generation | `npm run examples`: six actual cumulative A4 PDFs generated with 2, 3, 4, 6, 7 and 8 pages. These use fictional group data. |
| PDF integrity | Selectable text, A4 dimensions, author credit and profile-link annotations were checked on every page of all six checkpoints and the nine-page long-answer/review variant. No PDF JavaScript. |
| PDF layout | Cover, every content-page type, timeline, candidate continuation, dense comparison and final recommendation inspected as PNGs. A split-heading rendering problem and a mostly empty case-replay continuation were corrected. Final sample is eight pages. |
| Escaping and reflow | `node scripts/verify-render.mjs`: script-like answer text remains literal, zero network requests, no script execution and no horizontal overflow at 320, 390, 768 or 1280 px. Long answers are retained, not truncated; revised dependent chapters are visibly marked. |
| Prefab integration | `node prefab/verify-views.mjs`: real bundled Prefab 0.20.2 renderer and its emitted 0.3 envelope. Priority changes, multiple-First warning, evidence edits, assumption correction, readable review, unsaved-confirmation blocking, revision-labelled message, actual MCP save and confirmation, real PDF and exact download payload passed. |
| UI failure paths | Message rejection, download denial, 320/390 px reflow, no external requests and no runtime errors passed in the protocol harness. The confirmation path generated a 179,142-byte PDF. |
| Package format | Official skill and plugin validators passed. The manifest contains no invented server URL or privacy-policy link. |
| Final installation | Node dependencies and Prefab 0.20.2 installed in the canonical project folder. All 17 tests, real stdio PDF generation, Prefab-to-PDF flow and official validators passed there, including the workspace path containing spaces. |
| Teaching forward-test | An independent first-turn test with a university programme-office problem preserved an unknown baseline, respected text-only use, avoided an AI answer reveal and asked for group names/aliases. This was a bounded qualitative check, not a complete classroom trial. |

The pure protocol tests deliberately stub the renderer where they test state behaviour. Real rendering is separately proved by the six exports, stdio test and Prefab integration. The view harness uses actual SDK code with a small simulated host and deterministic message parser; it does not simulate an LLM's interpretation of arbitrary participant language.

## Corrections verified

A central-problem correction now returns the earliest phase that needs review. A chosen workflow must match a recorded alternative. Confirmation requires `approved: true` and the group's quoted approval; common explicit refusals are rejected. Recognising arbitrary conversational consent remains a host responsibility, not authenticated proof supplied by this server.

The Prefab field-change handlers explicitly update the associated draft state before marking it dirty. The view cannot confirm a locally edited but unsaved shortlist. Its accumulated preview uses readable fields, not raw JSON. Local reactive state is never presented as durable group storage.

## Not proved or not implemented

- No hosted endpoint, OAuth flow, public deployment or connector-directory installation.
- No actual end-to-end ChatGPT or Claude account journey. Their UI capability, resource delivery and download behaviour must be checked on the intended classroom clients.
- No authenticated persistent group database or automatic cross-client resume. JSON backup import is manual; concurrent copies are not merged.
- No classroom timing, load test, full assistive-technology audit or participant usability study.
- Prefab's self-contained renderer is approximately 6.74 MB. Acceptance by each target host's resource limits is unproved. The comparison currently uses a fixed light Terracotta theme; the checkpoint view also supports a dark theme.
- The full six-phase method is conversational. Prefab has been evaluated for the shortlist phase only; other proposed visual activity types have not been implemented as separate views.

## Design of Everyday Things check

Actions are named, the current revision and approval state are visible, and edits have a distinct save/review/confirm sequence. Comparison controls map directly to candidates, while the text summary carries the same facts. Errors state a recovery action and keep the group in conversation. These are inspected design properties, not a measured usability score.

## Scope and recovery

Work was built in a dedicated Git worktree with a committed plan and disjoint ownership. Verified units were staged with a full status audit. The new canonical programme folder and package are additive. The Hyundai workbook and existing consultant connector were not edited or deployed. Local source history remains in the dedicated build repository; no user repository history was rewritten.

The source archive is created from the clean Git head. Repeated archive generation must produce identical bytes. Archive inspection checks its inventory and rejects private runtime directories, AppleDouble entries, traversal paths and corrupt members. The canonical source copy is compared byte-for-byte with all 36 tracked source files.
