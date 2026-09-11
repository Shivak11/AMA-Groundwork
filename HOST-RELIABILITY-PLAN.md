# Reliable workshop in Claude and ChatGPT

Shiva requested this repair on 11 September 2026 after the actual Group 1A Claude test failed. This plan supplements CHAT-WORKBOOK-PLAN.md; its six-phase teaching method, native-question preference, complete chat fallback, read-only visual snapshots and cumulative PDFs remain binding.

## Required outcome

A participant can complete all six phases in both Claude and ChatGPT using ordinary language and native questions where supported. They never supply JSON field names or repair tool arguments. Their answers are saved in the correct fields, retained across later turns and shown coherently in the visual workbook. Corrections retain dependent work for review. Each explicit phase approval produces the cumulative PDF, and the participant can obtain the final PDF. A complete actual host journey is required in each product; local and endpoint-only checks do not replace this evidence.

Use Group 1A, Shiva and Chirag, with the supplied remote-team update problem. Additional details are clearly fictional test assumptions. No employee systems, actual reminders, rankings or messages to employees are in scope. The product remains industry-neutral.

## Evidence and repair decisions

The failed Claude conversation is https://claude.ai/chat/928ddb2d-6a4e-4101-b50d-6b988392420f. The final record was revision 6: Steps 1 and 2 confirmed, Step 3 draft with zeroSecond and recentCase absent. Earlier saves guessed fields and reconstructed malformed records. The view showed no task map despite the supplied sequence. Claude incorrectly asserted that the zeroSecond field did not exist. The cover expanded the full problem into its title.

1. Make the complete canonical record, exact phase answer schema, next question and safe retry instructions available in ordinary text tool content as well as structured output. Keep this technical context out of participant prose and the book. Publish a discoverable typed save schema instead of arbitrary answers. Errors must explain the correct fields without asking the participant to debug.
2. Reject empty save requests and report changed fields, retained fields, missing fields and readiness honestly. Identical retries must not invalidate approval or manufacture a new change. Do not weaken required fields, references, approval, privacy or no-pilot rules to get a passing journey.
3. Questions and approvals belong only to conversation. Honor an explicit ordinary-chat preference. Native options must have alternative and uncertainty paths. Validate readiness before asking for approval. Show saved visuals after meaningful decisions; routine and failed calls should not produce empty or duplicate workbook cards.
4. Strengthen facilitator guidance to distinguish supplied facts, proposed wording and unknown causes. Reuse answers already supplied. Ask briefly; avoid speculative diagnosis, sermons and long repeated summaries.
5. Preserve the established Terracotta book. Use a short stable book title with the full supplied problem in readable body text. Keep group members and authorship visible. Preserve full wording, accessibility, small-host readability and A4 output.
6. Verify PDF generation separately from actual delivery. Retain recovery on renderer or download failure. Do not add a participant database, public file storage, new permissions or a new paid service without a new decision.

## Ownership and execution

All implementation uses the existing clean dedicated chat-workbook worktree, initially 68140afd01909b5ba0d024a8cf3ffe6c7fc996c5. No shared main checkout changes. No .codegraph index or Git remote was present at inspection. Existing source archives and failed test reports remain intact.

Orchestrator owns src/server-core.mjs, src/workshop.mjs, src/conversation.mjs, src/question-routing.mjs, src/widget.mjs, any new src/model-contract.mjs, package files, remote files, skill/host guidance, README/source ledger, runner changes, integration, commits and deployment. Shared contracts and existing tests are reserved unless ownership is amended explicitly.

Book worker owns src/book-visuals.mjs, src/workbook-html.mjs, skills/ai-use-case-workshop/assets/workbook.css, and new tests/book-cover-regression.test.mjs only. These are the existing render path. If another file is needed, report it before writing. No server/schema changes. Use the established short title Our AI Use-Case Portfolio; keep the entire group problem as readable body text rather than generating or truncating its wording.

Test worker owns new tests/host-reliability.test.mjs and new examples/remote-team.mjs only. They cover the real Group 1A failure class with fictional data and text-only tool-result consumption. No weakening existing tests or production edits.

Reviewer is read-only and independently checks tool contracts, state loss and host compatibility against the exact diff. No simultaneous user-browser control; actual Claude and ChatGPT interactions are owned by the orchestrator.

After the cover unit is frozen, the book worker additionally owns src/inline-view.tsx, src/inline-view.css and new tests/progress-hierarchy.test.mjs. Shiva explicitly requested clearer step progression and host-compatible colour on 11 September. Put the viewed step and its saved or approved state first, identify the active next step separately, and make the group name secondary. Use visible words as well as theme-aware colours for approved, current, future and needs-review states. Preserve read-only visuals and all existing download callbacks. The orchestrator continues to own src/widget.mjs, src/inline-types.ts and shared design guidance.

Every builder reads this committed plan and relevant repository instructions. Builders are not alone: preserve foreign work, stat files before first write, and on an unexpected modification immediately copy the file plus git diff to a temporary snapshot, stop and report. Mid-flight ownership amendments require acknowledgement before the next write. The orchestrator reviews critical diffs and runs verification from disk, audits full status before and after narrow staging, and commits each verified unit.

## Verification gates

- Focused regression cases fail on the old contract: text-only result has canonical state and exact fields; zeroSecond/recentCase/workflow links; no-op save; identical retry; explicit chat mode; schema-error recovery; no premature approval; correction retention; unknown/no-pilot handling; malicious strings and old snapshot safety.
- Full Node tests, typecheck, widget build, remote dry run and controlled browser coverage. Test every phase, host dark/light and small width, complete book, long problem, error states and file controls.
- Review generated real PDF pages, selectable text, A4 size and hyperlinks. Record exact source, package, deployed version and previous rollback target separately. No CI claim without a real remote run.
- Deploy the repair to the existing authorised Cloudflare endpoint, keeping its access mode, bindings, limits and public scope. Replace-current and standing deployment authority are already recorded; no repeated approval for unchanged scope.
- Fresh actual Claude and ChatGPT conversations. Each must progress through six phases without technical field-name hints, show coherent saved visuals, accept an earlier correction safely, use native questions when available and ordinary chat when requested, and deliver the final PDF. Preserve conversation links and screen-by-screen observations. Host caching must be resolved through normal supported connector refresh, never assumed away.

The active goal stays open when any required host journey or delivery proof is missing. Record remaining defects and continue fixing them; do not redefine success as a passing local suite.
