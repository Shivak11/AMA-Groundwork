# One active question owner, 11 September 2026

## Locked product correction

Shiva reports the deployed UI is visually good but the MCP view and host-native question tool ask simultaneously. Retain the approved design. Only one surface may solicit an answer at a time. While the activity is active, the model must wait or use present_workshop_question to enrich that same surface; it must not call ask_user_question, AskUserQuestion, request_user_input, elicitation, or another parallel questionnaire. Chat takes over only on an explicit participant handoff or text fallback. The UI pauses its inputs during chat and offers a return action. Ordinary file delivery is not a question handoff.

## Scope and recovery

Base is the clean deployed 849833c70eced3debe0be8935823a241d06751a5, Cloudflare version 6c7f15c5-abbb-4c19-9e1f-7966d4554396. Work in this dedicated single-question-owner worktree. Deploy the bounded fix to the same public endpoint under the standing instruction; no new authority, service, data storage or record-schema change. Previous deployment is the rollback target.

## Implementation and ownership

- Parent owns src/question-routing.mjs, src/server-core.mjs, src/widget.mjs, src/inline-types.ts, tests, build/package version, release evidence and shared docs. Model-facing UI responses must not carry a second actionable question. Text mode retains complete guidance. The same ownership rule reaches initialization instructions, every result, every context update and skill/phase references.
- UI worker owns only src/inline-view.tsx (and src/inline-view.css if essential). Add chatActive/onResumeUi props consumption, a paused non-question state, and preserve the book/drafts/recovery. No style redesign.
- Independent scout/verifier is read-only and checks host-policy conflicts, handoff failures, drift and final live readback.

Workers are not alone. Stat before edits. At unexpected foreign changes, immediately preserve cp plus git diff before resolving ownership. No reverting other edits. Verify actual source and tests from disk; explicitly stage and audit full status before each commit.

## Proof

Add a regression that fails the old UI-mode responses: no duplicate question in content/phase/next and explicit host wait, while text-only questions still work. Test context updates after saves, explicit chat handoff hiding inputs, return, failed handoff/context sync and stale/late response guards. Run typecheck, full Node suite and real bundled six-step browser journey. Deploy clean head; read live version, tool instructions, question ownership and exact widget hash; run real remote checkpoint PDF. Actual host-model compliance cannot be enforced by our MCP server and must remain a separately stated host test, not inferred from a mocked tool selector.
