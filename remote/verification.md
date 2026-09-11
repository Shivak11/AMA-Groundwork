# Cloudflare release verification

Checked on 8 September 2026. This record describes the Cloudflare adaptation; the root verification record retains the earlier local-package checks. Published runtime source: `84352209431c5fe95969dba95c0cfe24afaf9321`. Cloudflare version: `89981a8c-bc65-44c6-a477-23cb3cc932ed`.

Verified endpoint: https://ai-use-case-workshop.shiva-research11.workers.dev/mcp

| Layer | Result |
| --- | --- |
| Source | The shared workshop engine preserves the six phases, explicit approval and cumulative export. Local and Cloudflare rendering use the same HTML and design assets. |
| Automated regression | All 23 state, protocol and access checks passed. Tests using a stub renderer are separate from actual PDF checks. |
| Worker build | Wrangler 4.129.0 dry-run succeeded. After the candidate-spacing correction, the bundle was 9,136.18 KiB before compression and 2,246.57 KiB compressed. No Python, local Playwright or browser-archive extraction implementation was present in the inspected Worker bundle. |
| Optional shortlist | Compiled layouts matched the existing Python adapter for 90 state combinations and three Unicode/whitespace edge cases. Runtime Python is not required in the Worker. |
| Visual correction | Screenshot inspection caught concatenated candidate labels and answers. Grouped label/answer rows corrected the spacing; desktop and 390-pixel layouts were inspected, and the six-phase stdio journey was rerun successfully. |
| Local Worker HTTP | Actual SDK clients discovered seven tools and seven resources. Text fallback, optional UI capability, explicit text override, origin rejection and payload limits passed. |
| Six-phase exercise | The local Worker returned six real PDFs and six JSON checkpoints. The screen review captured 21 interface states, including shortlist edits, unsaved confirmation blocking, declined downloads, restoration and correction of an earlier phase. |
| PDF inspection | The final test portfolio is eight A4 pages, contains selectable text and has a profile-link annotation on every page. The cover, representative content, workflow, comparison and final page were rendered and inspected. |
| Account authentication | Wrangler login succeeded for shiva.research11@gmail.com. The account's workers.dev subdomain is shiva-research11. The intended new Worker did not exist when checked; the existing consultant connector remains untouched. |
| Publication | Deployed after explicit public-access approval to the separate Worker on the verified account. Health returns enabled/configured and storage:none. |
| Live protocol | Actual remote text/UI SDK checks passed with seven tools, seven resources and a real phase-1 PDF. An independent verifier confirmed public discovery, correct resource identity, hostile-origin 403, oversized-body 413, incorrect media-type 415 and allowed preflight 204. |
| Live six-phase exercise | All six phases generated Cloudflare PDFs, with 21 captured interface states and no browser errors or external requests from the embedded views. Checkpoints have 2, 3, 4, 6, 7 and 8 pages. The final PDF is 133,377 bytes, SHA256 `deeacb6abe89335f2928e7cbd462775e5297edaba9f9176dce79a6965f92d192`. |
| Live PDF quality | All six PDFs are A4, tagged, selectable and contain no PDF JavaScript. DM Serif Display and the Linux sans-serif fonts are embedded. Authorship and profile-link annotations exist on every page. All eight final pages were rendered and visually inspected. |
| Codex installation | Added the remote URL to the user configuration and read it back enabled. The rest of the configuration is unchanged. An isolated real Codex CLI/model test called the live start_workshop tool and returned phase 1, draft, revision 0 and the correct first question. This was a first-turn test, not a complete model-led six-phase journey. |
| Claude Code installation | Added the remote URL at user scope; `claude mcp get` reports Connected. All 36 existing server entries are unchanged. A real model first-turn attempt could not run because Claude's OAuth session expired and could not refresh. |
| Claude Desktop configuration | Added the verified mcp-remote bridge using explicit Node and proxy paths; all eight existing entries are unchanged. An independent SDK test through that installed bridge discovered seven tools and started a fictional group. Desktop UI loading and interaction remain unverified: launch/settings interaction stalled and screenshot capture failed. |
| ChatGPT installation | Connected on the user-selected ailabs2 Free account after permission to enable Developer mode and CSP enforcement. Both settings are on. All seven tools were listed; the actual first tool call returned revision-0.json and rendered the embedded checkpoint view. |
| ChatGPT phase 1 | The actual conversation saved a supplied fictional draft as revision 1 with 0/6 confirmed and kept its baseline unknown. Explicit group approval produced revision-2.json and our-ai-use-case-portfolio-r2.pdf attachments; the embedded view showed 1/6 confirmed and the phase-2 question. See [the actual ChatGPT observations](chatgpt-verification.md) for file-delivery details and remaining limits. |
| ChatGPT file delivery | The embedded PDF download button failed and displayed its chat fallback. Ordinary chat links then opened the actual two-page PDF in ChatGPT's Library; its Download control produced a browser event and the verified 52,576-byte local file. The standard JSON download also produced a local file that parsed as revision 2 with phase 1 confirmed. The embedded button remains an unresolved limitation. |
| Real host journey | No complete six-phase ChatGPT or Claude model/UI journey is claimed. The 21-screen review uses returned resources in a controlled MCP Apps harness; the actual ChatGPT phase-1 evidence is recorded separately. |
| CI | No hosted CI run is configured or claimed. Local exact-source checks, independent review and live service tests are separate evidence. |
| Classroom readiness | Cohort concurrency, shared-network limits, classroom timing and participant usability are untested. |

The review runner writes timestamped evidence, actual returned files and an HTML report under `output/review/`. The canonical live report is `AI Use-Case Workshop/Review-2026-09-08-live/index.html`; earlier local reports remain separate. A host accepting a download request does not prove that ChatGPT or Claude delivered the file to a participant.

## Access and remaining limits

Public access permits anyone with the URL to consume the account's PDF allowance. Rate limits reduce bursts but are per location and eventually consistent, not a global spending cap. Private bearer access is implemented for header-capable clients; it is not OAuth and has not been proved compatible with the custom-connector screens in ChatGPT or Claude.

The application stores no group database or request-body logs. Cloudflare processes supplied answers during tool execution and PDF rendering, and each chat provider has its own retention policy. Downloaded JSON is the manual recovery mechanism; it is not automatic cross-client persistence or concurrent editing.

The dependency audit reports a transitive browser-archive extraction advisory. That extraction path was absent from the inspected Worker bundle, but the dependency audit is not clean. The early rejection responses currently do not all carry allowed-origin CORS headers, so a direct browser caller may receive a generic network error instead of a readable rejection. Server-to-server MCP checks are unaffected.

The disable switch is `WORKSHOP_ENABLED=false`. The committed configuration leaves access unconfigured; the approved live deployment explicitly sets `WORKSHOP_ENABLED=true` and `ACCESS_MODE=public`. No existing service, paid plan or participant data was changed. No prior version of this new Worker existed to roll back to; emergency containment is disabling only this service. Configuration backups were saved before adding each client entry.
