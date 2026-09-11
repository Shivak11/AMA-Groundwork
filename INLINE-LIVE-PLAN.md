# Deploy the approved inline workshop, 11 September 2026

## Scope and authority

Shiva approved the inline conversation concept and requested deployment to the existing public MCP endpoint. Replace the old UI there; retain its schemaVersion1 record, privacy/access mode, same Worker and rollback. No new service, database, unrelated connector or auth change. The prior deployed version is ef337bb8-8340-49ba-9501-4cf84922ae28 and must be read back before deployment. No separate approval needed for unchanged authorised scope. No hosted CI is configured; local and remote proof remain distinct from an actual host conversation.

## Product contract

- Deploy real generic group data, never the scripted hiring reducer or fake local replies.
- Match the approved concept: one active question/visual decision, quiet progress and a secondary growing book. No app navigation tabs, six-button phase bar, sprawling multi-field form or duplicate approvals.
- Keep existing server validation, explicit phase approval, unknowns, no-pilot route, full-wording readback, text fallback, pending reason gates, undo, revision fences and sync recovery.
- Edits start as local drafts and can be cancelled; saved earlier changes retain downstream wording as needs_review.
- Suggestions are explicitly proposals. A new bounded present_workshop_question tool may show scalar answer choices for one field; it must not mutate the record or silently approve. The group can type its own answer or continue in chat.
- React implements the view, while the existing MCP App bridge remains the transport owner. Host typography/colours and transparent outside; Terracotta belongs to the book.
- Use existing real book/PDF output and downloads; do not ship prototype print behaviour as server PDF generation.
- Correct the two verified Chromium128 PDF pagination defects while preserving document content.

## Ownership

- Orchestrator: src/widget.mjs transport/recovery adaptation; src/inline-types.ts contract; src/presentation.mjs; src/server-core.mjs; scripts/build-widget.mjs; package files; docs and tests/harnesses.
- UI worker: src/inline-view.tsx and src/inline-view.css ONLY, consuming the committed props contract. No runtime/controller/server changes.
- PDF worker: src/workbook-html.mjs, src/book-visuals.mjs and skills/ai-use-case-workshop/assets/workbook.css ONLY. Fix actual remote pagination with Chromium128-compatible repeated labels and keep heading with first table content.
- Independent scout/verifier: read-only; no implementation writes.

Stat before first write. At unexpected foreign modification, immediately cp the file and git diff to scratch, then stop and escalate. Use apply_patch. Workers are not alone. Verify disk results and explicitly stage/commit verified units with a full status audit.

## Release gate

Type check React, run all existing Node tests plus presentation validation, run browser native-bridge action/approval/PDF and failure cases, inspect narrow/dark/long-answer layouts. Inspect generated PDF actual pages and repeat after Cloudflare deploy. Build deterministic self-contained widget and read its hash live. Bind deployment version to clean source head, retain rollback version, verify live discovery/action/six-phase PDF generation with fictional inputs. Actual Claude/ChatGPT host behaviour is reported separately, not inferred from harnesses.
