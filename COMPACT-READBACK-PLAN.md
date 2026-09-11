# Compact conversational readbacks

Shiva rejected the live v0.6.0 card on 11 September 2026: long answer paragraphs, repeated progress labels and visible file/recovery controls made the conversation difficult to use. He explicitly requested StyleRef or a design reference, Impeccable, minimal copy and host-compatible colours. This is a presentation correction to the existing authorised deployment, not a storage or method change.

## Accepted direction

Use the alignment, single-family typography, flat structure and purposeful emphasis of StyleRef's Swiss Grid Interface (https://styleref.io/share/m4oe3xex-9d9958eaf732). This external reference is subordinate to the user's request: inherit host typography and semantic light/dark tokens, keep the outer surface transparent, retain plain connected language, and do not import a fixed red palette, opaque white ground or prescriptive voice. Impeccable's distill guidance supports progressive disclosure. Its context launcher failed; existing design files are authoritative.

Each closed card has a step title, one short state line, a small six-part progress track and one phase-specific compact visual. The only action is View workbook. No visible export links, backup JSON, group metadata, side book illustration, repeated progress sentences, expected-change paragraph or routine storage notice. Error feedback appears only when an actual action fails. An old view must still identify its shown step and the next/current step truthfully.

The workbook expansion contains complete saved wording for every step, PDF/record delivery, historical snapshot information and private recovery details. It stays read-only and works without a persistent URL for legacy local callers. Persistent readers and PDF source remain unchanged. No answers are truncated in storage or PDF. Inline previews may use visibly abbreviated extracts, with full wording in the expansion; they are never the complete approval summary. Numeric charts require an unambiguous recorded numeric value and its status; otherwise use relationships and sequence, never fabricated values.

## Ownership and verification

Use the existing clean dedicated chat-workbook worktree based on ecf3611. Root owns inline-view.tsx, inline-view.css, widget integration, documentation and deployment. The visual builder owns only src/compact-visual.tsx and src/compact-visual.css. The verification builder owns tests/progress-hierarchy.test.mjs and scripts/verify-persistent-browser.mjs, then a new tests/compact-visual.test.mjs if needed. No overlap. All agents preserve other work and snapshot any unexpected edits before proceeding.

Verify tests, typecheck, bundle, all six compact visuals, empty/review/long-answer states, one visible action, full-wording and file recovery in expansion, no forms/mutations, explicit host themes and 320px reflow. Inspect one batched desktop/mobile set, fix observed defects together and make one confirmation pass. Deploy the verified build to the existing endpoint. Previous actual-host tests stopped at Step 2/3 when Shiva rejected the UI; they do not establish completion. Resume those saved groups with the corrected UI and retain separate host/file receipt evidence.
