# Workshop usability and grounded use-case revision

Approved by Shiva on 12 September 2026 after the consolidated feedback and the additional requirement for plain-language discovery with a proposed technical implementation in the workbook. This file is the implementation specification.

## Scope and release

Base: d7b70aa1becbee8052728ff8d0c659e44bd4738d (live 0.6.1). Isolated branch: workshop-usability-20260912. Replace the current experience at the existing Cloudflare endpoint after verification, as explicitly requested. Do not change authentication, access authority, retention, database infrastructure or participant records. No automatic expiry. Retain the existing persistent reader and compatibility with saved workbooks. Previous Worker version df35410f-bf22-40c9-a50e-a84d509daa7a is the rollback target; verify current state before release. Source, tests, PDF rendering, deployment and real-host journeys are separate proof.

## Participant contract

- Start with roll/group number, member names and problem only. Automatically record the start date, preserving explicit existing dates on resume/import.
- Native questions remain preferred, with complete ordinary-chat fallback and no embedded answer forms or duplicate questions.
- Use short connected sentences. Each choice must make sense without remembering or scrolling. Lead with descriptive names, retaining C/T references alongside names and intuitive table headings. Keep a different answer and uncertainty available. Do not offer multiple First choices when the record permits only one.
- Do not narrate storage, activation, references, revisions, JSON, private keys or recovery in ordinary participant messages. Necessary permissions and failures remain honest and plainly worded. Private access references stay in tool data, not normal narration.
- Remove deliberate abbreviation of essential visible answers. Wrap full text and allow cards to grow. Preserve host typography, semantic light/dark colours, six-step progression and read-only snapshots.
- The group confirms its underlying problem and each grounded use case before phase approval. Reuse supplied answers and ask only missing questions that affect the approach.
- Keep identified use cases independent from implementation readiness. All candidates, including deferred/rejected candidates, remain explicit at completion. Never invent benefits or turn a no-pilot decision into approval to build.
- Phase 6 reviews the group recommendation. No new build/pilot offer after completion. Completed workbook opens inline automatically, with a prominent Download PDF control. Do not force an additional View workbook click. Preserve deliberate Close and ignore duplicate/stale events. Non-rendering hosts get clear reading/PDF links. Generated output and download success remain distinct.

## Shared data contract

Keep schemaVersion 1 and support old saved records. Add optional `experienceVersion: 2` for new experience records. New fields are optional when reading legacy records; new-experience readiness gates require them before the relevant phase is approved. Never fabricate missing legacy fields or invalidate old approvals solely because the UI was updated.

- Phase 3: `underlyingProblem?: string` is the group's agreed diagnosis after the case replay. Phase approval confirms this wording.
- Candidate in phase 4 retains id, title, taskIds, aiWork, value, humanCheck, nonAiAlternative, assumption. Add optional `inputs`, `output`, `trigger`, `knowledge`, `format`, `access` strings. These answer respectively what it reads, what someone receives, when it runs, which company guidance it consults (or none), repeated instructions/format, and who may access/share it. Unknowns are allowed and must remain explicit.
- Candidate optional `implementation`: `{ approach: string, components: [{ kind: 'Skill'|'Connector'|'RAG'|'Workflow'|'Agent'|'Human review'|'Other', purpose: string, basis: string, status: 'Proposed'|'Needs confirmation' }], checks: string }`. Components are recommendations grounded in group answers, not claims of working integrations or mandatory technologies. A component's basis states which requirement warrants it. At least one useful component; at most six. Ask behavioural questions, never ask the participant to choose a framework or vendor.
- Candidate optional `workflow`: array of 2–8 `{ actor: 'Person'|'AI'|'System', action: string }` steps representing the proposed sequence, confirmed with the candidate. The existing taskIds resolve to named current-workflow steps for comparison. Do not insert automatic sending or autonomous authority unless the recorded group agreement supports it.
- Existing phase 6 pilot enums are accepted for saved-record compatibility. Participant-facing labels and the final display separate the identified cases from whether implementation is recommended now. The completed book includes every documented candidate regardless of candidateId being null.

## Workbook contract

Preserve the Terracotta authored PDF and attribution. After the cover, insert an overview stating (1) the original problem, (2) the group-confirmed underlying problem, (3) named use cases and how AI could help. Missing legacy diagnosis is labelled honestly; do not guess it from a goal.

Each use-case section includes full wording, an accessible self-contained workflow diagram (tldraw/Mermaid-style, bundled HTML/SVG with no participant installation), named current workflow when available, proposed steps, human checks, success measure, and implementation proposal with meaningful technical terms explained once. The group does not have to know the mechanism names to answer. Include what is known, proposed and needs confirmation. The overview, diagrams and technical approach must appear in both the inline reader and PDF.

## Ownership

- Root: schemas and readiness, conversation and routing, persistent/local server messages, presentation validation, shared inline-types.ts, package/version/release configuration, shared docs and final integration.
- UI worker: src/inline-view.tsx, src/inline-view.css, src/compact-visual.tsx, src/compact-visual.css, src/widget.mjs, tests/compact-visual.test.mjs, tests/inline-view.test.mjs (if present), new tests/usability-ui.test.mjs. Coordinate before changing exports or shared types.
- Workbook worker: src/workbook-html.mjs, src/book-visuals.mjs, src/render-workbook.mjs, skills/ai-use-case-workshop/assets/workbook.css, new tests/usability-workbook.test.mjs. Root handles shared DESIGN.md and package dependencies. No new external renderer dependency required.
- Verification/data worker: examples/hiring.mjs, examples/remote-team.mjs (if present; otherwise create a synthetic example), new tests/usability-contract.test.mjs and scripts/verify-usability-browser.mjs. Do not edit other tests or shared scripts without coordination.

All agents share this worktree. Do not revert or stage someone else's work. Use apply_patch for edits. Workers are not alone. Root commits verified units after reviewing actual files and the full status. Snapshot foreign work immediately on collision; clean starting status was verified.

## Acceptance and failure checks

1. Start without date succeeds and records it; legacy explicit dates and resume dates survive.
2. Questions use names and practical descriptions, preserve one-question ownership and fallback, and contain no routine technical narration. Test the no-context choice wording, unknowns and invalid priority combinations.
3. New groups cannot confirm phase 3 without diagnosis or phase 4 without a concrete use case, input/output, human control and grounded proposal. Legacy workbooks remain readable and exportable without invented data.
4. Pilot, deferred and rejected-use-case journeys all end with named use cases, an open complete workbook and immediate PDF action. No repeated offer to build or restart questions.
5. Long text, Unicode, unbroken strings, keyboard focus, manual Close, duplicate replies, stale snapshots and light/dark 320/600/desktop render correctly. No essential truncation, unauthorized writes, model-context writes or fabricated metrics.
6. PDF cover/overview/use-case diagrams/technical proposal/final page are inspected as rendered images; verify A4, text extraction, links and pagination. Diagram labels and arbitrary group text are escaped.
7. Run complete source tests, typecheck, build and Worker dry-run; verify exact deployed widget and version, persistent resume/corrections and actual generated PDFs.
8. Run actual Claude and ChatGPT journeys for synthetic group 1A (Shiva + Chirag, remote team updates). Keep participant data untouched. Verify native questions/text fallback, no-pilot output, final reading and PDF delivery. Record unproved host paths honestly; produce a screen-by-screen review and sample PDF.

## Evidence log

Pending implementation. No changes to live behaviour have been made for this revision.
