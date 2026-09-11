# Conversation-led visual workbook

Approved by Shiva on 11 September 2026. Replace the current interface at the existing public MCP URL. Native host questions are preferred for bounded choices; ordinary chat is the complete fallback. No new account storage, permissions, services or paid dependencies.

## Product contract

All answers, corrections, decisions and phase approvals happen in the host conversation. The connector cannot invoke a host-owned tool itself or assume it exists. Its instructions ask the host to use an available native question tool for one question at a time, otherwise ordinary chat. Never ask the same question through both. Open explanations may use ordinary chat or voice. Native options must include a way to give another answer or express uncertainty.

The MCP view is a read-only workbook snapshot. It has no answer fields, Save, Approve, Return to activity, Undo, selection buttons or record reconciliation controls. It never calls a record-mutating tool, sends an old record into model context or claims to be the newest version across cards. Old cards remain harmless snapshots. It may expand a saved diagram, open the composed book, download its own PDF/JSON, or ask the host for current file links using a short normal sentence without attaching an old record. Browsing an old chapter never changes the workshop's phase.

The conversational record remains the complete latest tool-returned record. Save agreed wording promptly with save_workshop_phase. Top-level fields merge, arrays replace as documented. Never reconstruct the whole record from a narrative summary. Never clear previously saved answers unless the group explicitly corrects them. All existing six-phase validation, references, Unknown, no-pilot choice, explicit approval and earlier-change review rules remain.

## Visual delivery

Add show_workbook as the explicit read-only visual tool. Routine start, next, save, question preparation, actions and resume do not register a UI resource. show_workbook, show_shortlist, confirm_workshop_phase and export_workbook render read-only snapshots. Instructions call show_workbook after meaningful saved decisions, not before every question or redundantly after an approval/export that already renders it. End-of-phase approval continues to generate the cumulative real PDF.

Each snapshot has a plain group/workbook title, current saved phase visual, actual approval progress and optional full wording. Goal/KPI/guardrail relationship; information/authority blockers; numbered task journey; candidate AI vs non-AI and human checks; priorities with reasons (no invented numerical scores); pilot owner/test/stop conditions. Empty fields remain unrecorded. Never invent numbers to draw a chart. The book preview and PDF retain Terracotta; outer UI inherits host typography and light/dark tokens. Small screen uses one column. No automatic motion or extra design library. Design read: compact editorial workbook for business managers; existing system, variance 4, motion 1, density 4. Landing-page taste rules do not apply to the product's phase logic.

## Ownership

Orchestrator: src/widget.mjs, src/question-routing.mjs, src/server-core.mjs, a new src/conversation.mjs if useful, package files, build scripts, new browser/remote test runners, README/source ledger/skill/host guidance/design contracts, release evidence and deployment.

UI worker: src/inline-view.tsx, src/inline-view.css, src/inline-types.ts only. Simplify InlineProps to record, phaseId, bookHtml, hasPdf, exportFailed, notice, noticeError, busy, connected, onDownload(kind), onRequestFiles(). Keep exported semantic types used elsewhere. No mutation or model-context handlers in props.

Test worker: tests/question-routing.test.mjs, tests/chat-workbook.test.mjs and only other existing Node tests that assert retired presentation/metadata wording. Ask before changing another file. Cover native-first/text fallback, exact next missing question, full record preservation, approval/PDF failure and exclusive visual-tool metadata. No weakened domain invariants.

Scout/reviewer: read-only review of exact diff, old-record safety and native/text behavior. No edits.

All builders read this committed plan. They are not alone; preserve others' edits. Stat before first write. On unexpected file changes immediately copy and git diff the foreign work to a temporary snapshot, stop and report. Main re-verifies all files and tests from disk, audits full status before staging, and commits verified units.

## Verification and delivery

Typecheck, full Node tests, new controlled MCP Apps browser tests for all six visual phases, mobile/dark, long text, malicious wording, no inputs/mutation/context writes even on old cards, file fallback/failure, same-revision conflicting results and stale replies. Use fictional data only. Real remote initialization/tool/resource/widget bytes and all six PDF checkpoints. Separate local/browser/remote/Claude proof. Test a fresh actual Claude conversation after deploy, normal initiation without injecting special policy, a native choice when available, one saved answer, a visual snapshot, a follow-up preserving it and phase approval/PDF. Retain any host-specific limitation honestly.

Same endpoint and bindings, deployed source archived under the canonical programme folder. Previous deployment ca359bca-6fdd-4eb5-9736-1bb7b0b85384 remains the rollback target. No destructive cleanup or new storage. Standing deploy authority and replace-current choice are already settled.
