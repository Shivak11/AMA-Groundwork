# Verification record

The newer Cloudflare adaptation and release status are recorded in [remote/verification.md](remote/verification.md). The checks below describe the earlier local package and must not be read as proof of remote deployment or client registration.

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
