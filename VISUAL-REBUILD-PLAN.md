# Visual workshop connector rebuild

Approved local implementation scope: 11 September 2026. Base c415fd3 is an isolated snapshot of the canonical package. Worktree branch visual-workbook. The canonical package, prior inline candidate, installed connectors and public Cloudflare Worker remain unchanged until review and explicit production approval.

## Product contract

Participants converse in one group conversation, make meaningful visual choices, and confirm their own phases. One MCP installation supplies the activities and book. Chat edits and clicks use the same validated complete record. No account database, hidden browser persistence, third-party participant services or automatic cross-client resume is introduced. A host can only refresh a view after receiving a submitted event; actual Claude/ChatGPT side-panel behaviour must be verified independently of a harness.

1. Goal: choose/refine outcome and success measure (KPI), preserve unknown baseline and safeguards; compose a goal diagram.
2. Gaps: classify recorded information and decision barriers; show the holder and practical change in a relationship map.
3. Workflow: reorder recorded tasks, examine waits, select a task for the zero-second counterfactual; do not invent durations or savings.
4. Candidates: keep/reconsider proposals tied to workflow steps; show AI work, human checks and non-AI alternatives.
5. Priorities: move candidates between First, Later and Do not pursue, with at most one First; ask only for missing reasoning/evidence and retain dissent.
6. Recommendation: agree a bounded test or no-pilot decision, owner, evidence and stop rule. Produce the completed book.

Each phase has a distinct activity. Unknown/missing content triggers a focused conversation rather than a large blank form. Group-confirmed chapters accumulate in a readable book view, keeping the active exercise separate. JSON backup and technical details are disclosed only on request. Drafts are not printed as confirmed decisions. Correcting earlier answers preserves later work and marks affected conclusions for review. A failed PDF must not lose an approved decision: confirmation returns the accepted record with a truthful export failure and retry route.

## Shared code contract

Preserve v1 input compatibility. Add an optional validated interaction field for incomplete visual selections, with a bounded undo state. Domain module exports actionSchema and applyWorkshopAction(record, action). Action includes expectedRevision and phaseId. Supported kinds: set_answer (one allowed field/value), classify_barrier (index/category), reorder_tasks (ordered task IDs), choose_zero_task (task ID), candidate_disposition (candidate ID, Keep/Reconsider), prioritise (candidate ID, First/Later/Do not pursue), undo. Mutations return a complete validated record. Intermediate choices do not fabricate required reasons, missing evidence or agreement. Selection data is explicitly surfaced to the host for follow-up and reconciliation. Revisions fence a request against its supplied record, not a server-held global version; one conversation/latest record remains required.

Register workshop_action as a shared model/app tool. The widget invokes it directly, adopts only valid non-stale responses, and sends the latest complete result to model context. If context sync fails, show that clearly and prevent silent continuation on divergent records. Explicit confirmation is a separate tool/action and cannot be inferred from choosing a chip. Existing conversation save/confirm/export tools remain usable. Do not add unrelated MCP servers or licensing requirements.

## Visual contract

Inline activity inherits host typography, light/dark colour variables and transparent outer background. Use large meaningful diagrams, native buttons with at least 44 px targets, keyboard equivalents, semantic headings and visible focus. The book alone uses the approved Terracotta palette: paper #F8F0E4, ink #3A241C, secondary #6F5A4E, accent #9B4625, rules #BCA48E. DM Serif Display for book headings; system sans for content. No italics, decorative label layers or fabricated charts. A title grounded in the group's problem, group name and members establishes the cover. Every chapter is Step 1, Step 2 etc, with authorship/profile link and full wording retained. Use two dominant visual structures at most per chapter and natural pagination for long answers.

Use bundled HTML/SVG components and the already installed renderer first. pdfcn is a useful design/component reference, but exact registry payload was not inspectable and no React rendering dependency is installed. Do not claim pdfcn integration. Mermaid/React Flow/tldraw are optional implementations, not acceptance criteria; no library is added unless a demonstrated interaction needs it. Self-contained custom components are an acceptable one-install implementation.

## Ownership and sequence

Orchestrator reserves src/server-core.mjs, server/remote adapters, build scripts, package metadata, documentation/skill contract, examples and integration/browser tests. Agent state owns src/workshop.mjs, new src/actions.mjs and tests/actions.test.mjs. Agent UI owns src/widget.mjs, src/widget.css and new src/activity-view.mjs. Agent PDF owns src/workbook-html.mjs, new src/book-visuals.mjs and skills/ai-use-case-workshop/assets/workbook.css. No shared writes. Each builder reads this committed plan, stats targets before writes, and snapshots unexpected foreign changes with cp plus git diff before stopping to report. No builder commits; orchestrator verifies from disk and commits scoped verified units with staging audits.

First prove phase 1 through actual tools, widget transport and generated PDF. Then complete all six, correction/undo, stale or failed replies, export failure/retry, text fallback, old records, long text, narrow/light/dark and reduced-motion layouts. Reuse existing tests and independently review the final clean head. Produce a local screen-by-screen HTML review with labelled harness evidence, actual PDF checkpoints and a durable source candidate. Actual host, installation, remote deployment and classroom usability remain separately unproved until exercised.

## Recovery

No live activation in this implementation turn. Candidate can be discarded without touching live state. Preserve canonical source and prior candidate. Do not automatically migrate or replace old participant backups. Before future release compare old/new records and prepare named rollback artifact.

## Implementation clarifications

Independent failure review required more explicit decision reconciliation: pending priority changes must match the saved choice; unchanged candidate saves do not erase Reconsider; selecting a different zero-second task invalidates the earlier counterfactual answer. PDF and optional book-preview delivery fail independently of the accepted record.

The browser uses the same semantic record validator as the server. Local unsaved editors survive view changes. Repeated host messages cannot clear failed context synchronisation, and conflicting records pause edits until the group explicitly resolves them. Because v1 has no immutable group identity, changed group details require an explicit record-selection step. No database identity or automatic merging is inferred.
