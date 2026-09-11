# AI Use-Case Workshop implementation

## Locked decisions, 8 September 2026

Build a new generic classroom skill and local MCP package alongside the unchanged Hyundai workbook. The book title is `Our AI Use-Case Portfolio`. Groups confirm and continue themselves. Support one conversational method for ChatGPT and Claude, optional shared-standard MCP Apps views, and a complete text-only journey. Do not deploy or advertise a live endpoint in this task.

Keep Terracotta typography and colours, clear hierarchy, accessible controls and no italics. Follow the teaching workspace's writing and authorship rules. Use first names or aliases; organisation and roles are optional. No private recordings, real group data, fabricated baselines, automatic grading or forced positive AI recommendation enter the package.

## Product and state contract

One group owns one conversation and a versioned JSON record. Every tool receives and returns the complete record. There is no server-side participant database and no automatic cross-client resumption. Downloadable JSON checkpoints are explicit manual backups; they are not authenticated cross-client storage. Future automatic resumption requires authenticated, durable group storage, retention and authorisation design.

The record is `{schemaVersion:1, group:{name,members:[string],problem,context,date}, revision:number, phases:[{id:1..6,status:'draft'|'confirmed'|'needs_review',answers:object,approvalNote?:string,approvedAt?:string}]}`. All six phases are always present. Date is ISO YYYY-MM-DD. Unknown is a valid answer; absent required fields prevent confirmation. The first non-confirmed phase is current. Edits retain subsequent answers and mark confirmed dependent phases `needs_review`. No silent overwrite or phase skipping. Stateless tools cannot resolve concurrent copies; the host must use the latest returned record. Widgets send visible, revision-labelled requests through chat, never silently maintain an independent record.

Exact phase answers (strings unless stated):

1. `outcome`, `kpi`, `baseline`, `guardrail`, `hypothesis`.
2. `blockers:[{information,holder,barrier,unlock}]` (1–5), `firstGap`.
3. `workflows:[string]` (1–3), `chosenWorkflow`, `recentCase`, `tasks:[{id,actor,work,friction}]` (2–6), `zeroSecond`, `redesign`.
4. `candidates:[{id,title,taskIds:[string],aiWork,value,humanCheck,nonAiAlternative,assumption}]` (1–5). Aim for 3–5, but one grounded candidate is acceptable. IDs refer to phase-3 tasks; genuinely new work uses an empty taskIds array and names its dependency in assumption.
5. `choices:[{candidateId,decision:'First'|'Later'|'Do not pursue',reason,evidenceGap}]` (one per candidate), `challenge`, `costs`. At most one First; none is allowed.
6. `decision:'Test a use case'|'Do not pilot yet'`, `candidateId:string|null`, `owner`, `evidence`, `peopleChange`, `test`, `stopRule`, `recommendation`. A pilot references the single First candidate; a no-pilot decision has null candidateId and a useful next evidence/non-AI step.

Text is bounded (normally 1,200 characters per field, IDs 40, names 120); arrays are bounded. Rendering escapes all user text and blocks network access. Tool descriptions and returned phase instructions carry the method even where SKILL.md is not automatically loaded.

## Conversational method

Six short phases: complete an outcome statement; sort barriers; replay a difficult actual case and ask the zero-second question; critique candidate cards; compare priorities and invite a dissenting member; recommend a bounded test or no pilot. Ask one manageable conversational move at a time and reuse answers. Show group commitment before model suggestions. Keep counterarguments and uncertainty. Offer a checkpoint after about 2–3 focused exchanges rather than force an exhaustive questionnaire. Ask for explicit group approval of a readable phase summary before calling confirmation. Every successful confirmation produces an actual cumulative PDF and a JSON backup. If rendering fails, confirmation is not advanced and can be retried. Re-export is available in text mode.

## Rendering and interaction interfaces

`src/render-workbook.mjs` exports `renderWorkbookHtml(record)` -> string and async `renderWorkbookPdf(record, options={})` -> Buffer. It assumes a validated record. Include cover plus confirmed or needs-review chapters only. A needs-review chapter is visibly labelled as such. Draft answers are not represented as agreed decisions. Use natural A4 pagination; never clip or shrink long content. Footer attribution and a working profile link appear on all pages. Embed the local licensed DM Serif Display font. PDF generation uses Playwright Chromium, no remote fetches, bounded timeouts and finally-close. `options` may provide an executablePath for local test environments.

`src/workshop.mjs` exports schemas, createRecord, savePhase, confirmPhase (pure proposed transition), currentPhase, phaseGuide and readableSummary. Main orchestrator owns all shared contracts.

The MCP server exposes start_workshop, workshop_next, save_workshop_phase, confirm_workshop_phase, export_workbook and resume_workshop. Resources expose the skill, phase guidance, design contract and an optional self-contained `ui://` activity view. Tool text always contains progress, readable answers and what to do next. PDF and JSON are returned as embedded MCP resources; the optional app uses host-mediated download. Detection uses actual advertised UI capability and supports user-requested text mode. No UI action is required.

Reusable views show an editable problem card, chronology, candidate cards, side-by-side priorities and a checkpoint preview. All view edits send clear user messages to the host, with revision labels and stale-message caution. No browser app is a fallback requirement. UI errors explicitly direct the group to the equivalent conversational action.

## Ownership and phases

1. Orchestrator: this plan, package manifests/lock, src/workshop.mjs, src/server.mjs, src/stdio.mjs, src/cli.mjs, tests/**, examples/**, README.md, source-ledger.md, verification.md, packaging, commits and final integration.
2. Teaching builder: only skills/ai-use-case-workshop/SKILL.md and skills/ai-use-case-workshop/references/{phases.md,foundations.md,host-contract.md}.
3. Design builder: only skills/ai-use-case-workshop/assets/{DESIGN.md,workbook.css,fonts/**} and src/render-workbook.mjs.
4. Optional Apps builder: only src/widget.mjs, src/widget.css, scripts/build-widget.mjs and prefab/**. Generated dist/widget.html and dist/prefab-renderer.html are build output. Wait for locked response shape before writing.

### Approved Prefab evaluation, 8 September 2026

Shiva approved installing and evaluating Prefab on one complete phase-5 exercise before broad adoption. The current package registry resolves prefab-ui 0.20.2; pin this exact version in an isolated environment. Prefer an additive JSON-renderer adapter to the Node MCP; do not migrate the existing consultant server. Read the official documentation index and relevant protocol, installation, theme and action references. Build developer-authored reusable comparison components, not model-generated code. Browser reactive state is only an unsaved input draft. The server-validated workbook and explicit checkpoint remain authoritative. Evaluate comparison, assumption correction, missing evidence, confirmation and resulting PDF, plus complete text fallback. Report actual host and adapter gaps honestly.

Builders are not alone. Stat owned files before writing. On unexpected foreign modification, immediately copy it and capture git diff in scratch, then stop and report. Never revert another builder. Shared files remain orchestrator-owned. Amendments require acknowledgement before another write. The orchestrator verifies from disk and audits full status against staged paths before committing each verified unit.

## Verification and delivery

Run pure state boundary tests, text-only full six-phase journey, invalid confirmation, earlier-phase revision, no-pilot, input escaping and long-text tests. Run real MCP stdio initialisation, prompts/resources/tools, UI capability negotiation and embedded PDF signature checks. Generate six cumulative fictional checkpoint PDFs and final example; inspect A4 dimensions, selectable text, links, cover, dense pages, final page and overflow. Test widget rendering at 320/390/desktop, edits, download success and denial in an SDK protocol harness. A harness is not actual ChatGPT/Claude runtime proof.

Forward-test the skill independently with a non-automotive group and inspect its questions. Validate skill and plugin. Build a clean archive from tracked files, reject private paths, secrets, node_modules and AppleDouble/PAX files. Deliver editable source, consistent design contract, sample final PDF, verification record and local connector configuration. Live ChatGPT/Claude connection, remote authentication, classroom load and remote rendering remain explicit unproved deployment work.
