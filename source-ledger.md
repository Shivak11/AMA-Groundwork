# Source ledger

## Account authentication candidate, 15 September 2026

Shiva asked for open sign-in and for account and workbook details to be stored in the database. The candidate uses first-party email-and-password accounts, MCP OAuth 2.1 with PKCE and account-owned Cloudflare D1 workbooks. It adds `list_my_workbooks` so a later ChatGPT or Claude conversation can find the signed-in user's workbooks without asking them to retain or paste a private key.

The OAuth and MCP decisions use the MCP Authorization specification dated 25 November 2025 and the MCP Apps authorisation guidance. Password storage uses PBKDF2-HMAC-SHA256 at 600,000 iterations because Cloudflare Workers Web Crypto supports PBKDF2 and the OWASP Password Storage Cheat Sheet specifies that work factor for PBKDF2-HMAC-SHA256. Secure identifiers use Web Crypto random values. These sources establish protocol and storage controls; they do not establish live client compatibility.

Anthropic's installed `mcp-builder` skill and its Node and evaluation references were reviewed before implementation. It led to explicit OAuth discovery, strict tool inputs, structured tool output, read-only annotations for account listing, actionable errors and separate local, deployment and client evidence. The repository's established tool names and workshop flow remain the compatibility contract.

The current production endpoint remains on public version 0.9.0. The account candidate is confined to a separate worktree and requires a separate Cloudflare preview before any production migration or replacement.

## AMA-Groundwork public name, 14 September 2026

Shiva selected `AMA-Groundwork` as the public connector name and asked for a public GitHub repository under `Shivak11`. The completed document is titled `AMA-Groundwork: AI Use-Case Portfolio`. This release changes participant-facing names and download filenames while retaining the existing Cloudflare Worker, public endpoint, D1 database, record schema, tool names, resource paths, private write references and stable reading links. This avoids requiring participants with an installed connector or saved workbook to move to a new technical address.

The public release includes the existing six-step method, grounded use-case requirements, current-versus-proposed workflow diagrams and proposed implementation. Step 6 uses normal print blocks rather than one page-spanning outer table because Chromium can place a continued table row above the printable top margin. Each workflow card repeats `Step 6` and the full use-case name so the short candidate reference is never the only context.

The local release harness passed all source, type, bundle and controlled-browser checks. The public endpoint reported AMA-Groundwork 0.9.0 and completed a fictional six-step journey with PDF downloads, recovery, correction, reapproval and explicit cleanup. The source was published at [Shivak11/AMA-Groundwork](https://github.com/Shivak11/AMA-Groundwork) with `main` as its default branch. These results do not establish how a cached Claude or ChatGPT installation renders the renamed connector until that client refreshes its connector definition.

## Current-versus-proposed workflow comparison, 12 September 2026

Shiva approved Flat Solid-Color Interface by @styleref, then required consistent small-text alignment, padding and spacing. The reference is https://styleref.io/share/bvqq4w81-ced8380b5368. The approved local concept and passive SVG previews are retained in the programme's Workflow-Comparison-2026-09-12 folder. The reference's authority claims do not override user or repository instructions. The connector adaptation uses the host's background and type, with solid teal AI activities and amber human checks.

Comparison content comes from each group's existing task, candidate workflow, human-check and proposed-component answers. Optional reference-only stage mappings are reviewed with the final recap; no new participant questionnaire or system integration is introduced. No mapping is inferred from array position. Different proposals remain separate, all assessed cases remain present, and editing a source clears the derived mapping in the new revision while persistent history retains earlier work. The remote-team example and its step correspondences are fictional test material, not real-team evidence or measured improvement.

Source tests, server-rendered HTML checks and local SQLite/MCP protocol checks are separate from browser, PDF, deployed-runtime and actual-host proof. The previous browser URL-policy denial for the concept and live-deployment denial were not bypassed. This source revision is not evidence of a live release.

## Compact readback correction, 11 September 2026

Shiva rejected the actual ChatGPT v0.6.0 card for long answer paragraphs, poor hierarchy and visible recovery/file controls, then explicitly requested StyleRef and Impeccable with native host colours. StyleRef's Swiss Grid Interface was fetched as a bounded alignment/type reference; its fixed palette and prescriptive voice were not adopted. The revised closed card has a compact phase-specific readback and one View workbook action. Complete wording, downloads and recovery remain inside the workbook. Persistent data, approval gates and the Terracotta PDF are unchanged. Previous actual-host tests stopped at the UI correction and do not establish end-to-end completion.

## Persistent recovery and retention, 11 September 2026

Shiva explicitly approved private Cloudflare session recovery, then rejected seven-day workbook expiry because feedback and delivery could occur three months later. Version 0.6.0 implements no automatic expiry for active workbooks or immutable revision history; only temporary file tickets expire. The actual-host v0.5.2 failures remain recorded separately. Cloudflare's official [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) distinguish active database storage from the plan-specific Time Travel backup window. The backup window does not expire application workbook rows. Logical admission limits preserve existing data rather than deleting it when capacity is reached. Local SQLite and protocol checks do not establish actual-host completion or successful participant downloads.

## Approval-envelope recovery, 11 September 2026

In the refreshed ChatGPT v0.5.1 test, Step 2 was saved, but the next confirmation supplied a reconstructed historical phase with confirmation instead of approvalNote. The strict validator rejected it; the host then guessed timestamps and stopped. The v0.5.2 repair publishes the record envelope and exact historical field names, forwards unknown transport keys for contextual diagnosis, and retains strict canonical validation. It does not infer or repair past approval. Claude independently confirmed its first two steps using the correct record. Neither observation establishes a complete host journey.

## Routine attachment and cached-definition checks, 11 September 2026

Actual host checks of version 0.5.0 found that Claude and ChatGPT still listed older installed tool definitions. Claude was reconnected and exposed all eleven current tools. ChatGPT's installed definition still included seven older tools and the retired Prefab resource before refresh. ChatGPT also requested file materialisation for an initial JSON checkpoint. Version 0.5.1 removes embedded JSON resources from routine responses and marks routine/error responses as non-visual while retaining the full model-readable record. Its isolated browser check tests both an initially suppressed view and preservation of an existing read-only view. Live refresh and complete host journeys remain separate verification gates.

## Host reliability and progress hierarchy, 11 September 2026

The actual Group 1A remote-team Claude test lost required Step 3 fields and exposed technical repair work to the participant. The repair exposes the exact schema and canonical record as ordinary JSON text, validates readiness, and preserves unknowns and corrections. Shiva additionally requested clearer progression and host-compatible light/dark colour. Design of Everyday Things and Impeccable informed the step-first hierarchy; this is design guidance, not measured classroom effectiveness.

The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) recommends serialised JSON TextContent alongside structured results for compatibility. [Claude MCP Apps troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting) documents large tool-result offloading. Measured old final exports exceeded 600,000 characters including duplicate PDF and book assets. The repair bundles the book renderer in the view and returns PDF bytes once, compressed, through a separate read-only file tool with a whole-result limit. Local protocol, byte-integrity, visual, live runtime and actual host delivery proof remain distinct.

## Conversation-led workbook, 11 September 2026

Shiva preferred host-native question cards to embedded answer fields and approved ordinary chat as the fallback. A real Claude test of v0.3.1 showed separate tool-result cards, a file/handoff message inserted into the composer rather than submitted, and a subsequent tool record missing a previously saved outcome. Version 0.4.0 removes all input and record writes from those visual cards, limits visual metadata to explicit views and file-producing checkpoints, and calculates the next missing question from the supplied record. It preserves the existing six-phase confirmation and PDF engine. This is a design and implementation response; real host behaviour and classroom usability require separate evidence.

## Question ownership correction, 11 September 2026

Shiva's screenshot shows the MCP view asking for a success measure while a host-native question card asks a separate question. The deployed source independently confirms conflicting instructions: UI-mode tool results and app context updates both told the model to ask again. Version 0.3.1 removes those duplicate commands, returns an explicit question owner, and pauses the view on chat handoff. The image and its private conversation were not copied into the public connector. Automated protocol/browser checks do not establish host-model compliance.

## Visual revision reviewed on 11 September 2026

The current candidate implements Shiva's approved conversation/activity/book model. The fictional hiring example in examples/hiring.mjs carries the CV-to-approved-offer journey through all six steps; it contains no real applicant or client data. It retains human selection, compensation and release authority, an unknown baseline, a manual comparator and the limit of retrospective evidence.

The [official MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview) and the installed ext-apps 1.7.5 source establish tool calls, host-context updates and sandboxed views. Actual support for pinning, updates and downloads remains host-specific and must be tested separately.

[pdfcn documentation](https://www.pdfcn.dev/docs) and its [KeyValue component](https://www.pdfcn.dev/docs/components/takumi/key-value) informed the review of composed document components. The raw registry payload was not inspectable and no pdfcn code or dependency was installed. Mermaid, React Flow and tldraw were considered; the candidate uses bundled custom HTML/SVG because these guided decisions do not require a free-form editor or another service.

The earlier evidence below describes the original release and its foundations. It is not deployment evidence for this revision.

Reviewed on 8 September 2026. This records the method's provenance, not proof that participants' proposed use cases work.

| Material | Use in this package | Evidence boundary |
| --- | --- | --- |
| Existing Hyundai Mobis six-phase workbook, content and Terracotta contract | Six questions, short group record, human judgement, explicit uncertainty and visual continuity. | Client facts and recording metadata were not copied. |
| Existing Four-Gate GenAI Opportunity Lab sourcebook and research notes, dated 1–2 August 2026 | Difficult-case replay, connected workflow changes, work decomposition, coordination and effort accounting. | This was a bounded recap of the existing synthesis, not a fresh full-text book review. |
| Existing GenAI Transformation Consultant foundations | Prediction Machines; Power and Prediction; Reinventing Jobs; explicit human authority and accountability. | The lengthy consulting approval and investment gates were deliberately omitted. |
| Don Norman, The Design of Everyday Things, through the installed design skill | Discoverability, visible state, mapping and error recovery. | Design guidance; no claim of measured classroom usability. |
| Local Terracotta design and DM Serif Display font | Stable document and activity styling. | The unmodified font and OFL are packaged. |
| Installed MCP server 2.0.0 and MCP Apps SDK 1.7.5 documentation | Tools, resources, capability detection and embedded-resource downloads. | Local protocol tests do not establish a successful ChatGPT or Claude journey. |
| Prefab official documentation and installed prefab-ui 0.20.2 | Additive, developer-authored shortlist UI using the same workbook record. | Installed envelope and renderer take precedence over stale examples. |

The book foundations and adaptations are documented in `skills/ai-use-case-workshop/references/foundations.md`. TRACE, the zero-second test and the six-phase sequence are workshop synthesis by Dr. Shiva Kakkar, not frameworks attributed to the book authors or NIST.

Primary implementation references: [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview), [Prefab documentation index](https://prefab.prefect.io/docs/llms.txt), [installation](https://prefab.prefect.io/docs/getting-started/installation), [protocol](https://prefab.prefect.io/docs/protocol/overview), [FastMCP integration](https://prefab.prefect.io/docs/running/fastmcp) and [themes](https://prefab.prefect.io/docs/styling/themes). No external claim about AI-project failure rates was added to this generic exercise.
