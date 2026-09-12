# Connector workflow comparison

## Approved scope

Integrate Shiva's approved Flat Solid-Color Interface comparison into the existing conversational MCP connector and cumulative workbook. The latest corrections require aligned small text, consistent padding, complete wrapping and host-compatible light/dark colours. Replace the final readback's repetitive one-sided flows with a current-versus-proposed comparison. Keep the current conversation-led questions, approval, persistent records, final auto-open and prominent PDF download.

Source baseline: d6868f9, containing locally verified 0.7.0. Live remains 0.6.1. The prior deployment denial still applies; local implementation is authorised, live replacement requires APPROVE SUPER-OUTER WORKSHOP-USABILITY-LIVE.

## Locked design and data decisions

- Use native host background and typography. Flat neutral current-work panels, teal AI activities, amber human checks. Text labels accompany colours. No shadows, gradients, new forms, navigation or extra MCP dependency.
- One comparison per named use case, including deferred and rejected cases. Do not merge alternative proposals into an invented combined process. Each comparison states that it covers the related current tasks.
- Reuse saved phase-3 task actor/work, phase-4 proposed workflow actor/action, humanCheck and implementation components. Never fabricate task wording, integrations, measured savings or an AI component to fill a space.
- Add optional phase-6 workflowComparisons, an array of {candidateId, stages:[{taskIds, proposedStepIndices}]}. References only; no duplicate participant prose. Indices are zero-based and internal. Exact coverage: all linked current tasks and all proposed steps once, in recorded order. Each stage has at least one side. Empty current/proposed sides explicitly mean an added step/a step not included in this proposal. Unknown, duplicate, omitted, reordered and cross-case references fail confirmation. This is optional for legacy and already-completed records.
- The host drafts the mapping from recorded answers as part of the existing final review. Do not ask participants to supply IDs or technical mapping. If correspondence is uncertain, omit the mapping and keep separate sequences with a concise explanatory label. There is no extra mandatory question.
- Shared pure comparison model supplies widget and book, defensive against draft/stale references. Invalid or missing alignment falls back to unaligned sequences. Never pretend that a stale mapping is confirmed.
- When phase-3 tasks or phase-4 candidates change, remove the derived phase-6 mapping from the new revision. Participant answers remain intact and persistent immutable history retains the previous mapping. This prevents an old numeric step index silently pointing at a reordered action. Reopening without a source change does not remove it.
- Wide surfaces show paired current/proposed activities in shared positions. Narrow screens and portrait print use a two-column current/proposed matrix, stacking a pair on the smallest screens. Each cell wraps fully, uses consistent 16px inset (print equivalent), with aligned role/action spacing. Do not force fixed card heights, tiny fonts or horizontal scrolling to preserve desktop geometry.
- Components attach to their named use case rather than inventing per-step component links. MCP/connector or RAG appears only when recorded, with its proposed/needs-confirmation state. Existing full implementation prose remains in the detailed chapter.

## Ownership

Root: PLAN, src/workshop.mjs, src/conversation.mjs, src/workflow-comparison.mjs, src/inline-types.ts, package manifests/version references, host guidance, shared design contract, integration tests and release evidence.

UI worker: new src/workflow-comparison.tsx, src/compact-visual.tsx, src/compact-visual.css, tests/workflow-comparison-ui.test.mjs only.

Book worker: src/book-visuals.mjs, skills/ai-use-case-workshop/assets/workbook.css, tests/workflow-comparison-book.test.mjs only (verify actual stylesheet path before edits; report mismatch).

Agents are not alone. Inspect file state before first write. At unexpected edits or mtime collision, immediately copy the file and capture git diff before any decision, then stop and notify root. Do not revert another's work. Shared files are reserved for root. Mid-flight amendments require acknowledgement before next write.

## Verification and recovery

Test exact/no mapping, added/removed/combined stages, long text/unbroken text, unsupported actor, multiple candidates, no-pilot, legacy records, needs-review records, escaped markup, invalid references and unchanged completion/download behaviour. Run all tests, typecheck and bundled build from this worktree. Inspect actual generated SVG/PNG previews; do not bypass the existing browser URL-policy denial for the local concept. Separate source, static rendering, PDF/interactive browser, deployed runtime and actual-host proof. No measured usability claim.

Commit verified units with explicit path staging and full git-status audit. Keep the compatible reader and disable writes if containment is needed after deployment; do not roll back to 0.6.1 after new records exist. No database migration or deletion.
