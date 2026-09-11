# Inline conversation concept, 11 September 2026

## User decision

Shiva rejected the full-screen MCP app's complexity and asked for a simple HTML concept resembling inline HTML in a conversation. The concept precedes any further runtime replacement. The earlier approved 0.2.0 connector has deployed separately and remains unchanged by this prototype.

## Locked interaction

- One active question and one decision surface. No activity/book/split tabs, dashboard navigation, record revisions, JSON controls or full-form editor.
- Conversation is the primary surface. A small cumulative book preview becomes available after the first confirmed step. Previous exchanges remain readable, but their controls become compact summaries.
- Six coherent steps: business goal/KPI, obstacle, work, candidate, priority, test. Fictional hiring example from CV receipt to offer release.
- Clickable choices and task mapping reduce typing. A short note is optional. The concept uses deterministic scripted replies, labelled as a prototype; no simulated model or connector capability is presented as live.
- Book styling retains restrained Terracotta. Chat uses neutral host-compatible tokens. No host brand impersonation. Diagrams encode recorded choices; no fabricated quantities or savings.
- A reversible decision is committed with one labelled action; back/edit invalidates later answers. No duplicate approval forms.
- React with TypeScript, a pure reducer, discriminated step IDs, scoped CSS, keyboard access, reduced motion and responsive layouts.
- The generated book includes a cover, group, numbered steps, decisions, uncertainty and human authority. The prototype's print action opens the real print dialogue; do not call it a server-generated PDF.

## Ownership

- Orchestrator: concept/App.tsx, concept/main.tsx, concept/style.css, concept/index.html, concept/build.mjs, concept/package.json, concept/tsconfig.json, concept/README.md, tests and project/release documentation.
- State/copy worker: concept/model.ts only. No other file changes.
- Independent review worker: read-only review and release PDF inspection; no code edits.

All writes use apply_patch. Stat before first write. Snapshot unexpected foreign changes with cp and git diff at detection, then stop and escalate. Verify disk outputs before committing explicit files and audit full git status.

## Acceptance

Type check and reducer tests; browser exercise all six steps, edit/back, notes, book generation, narrow viewport, keyboard and dark mode. Inspect screenshots of initial state, an active visual choice and completed book. Open self-contained HTML in Codex for Shiva's review. Preserve editable source and verification alongside it in the programme folder. This concept is not evidence of a new Claude or ChatGPT host integration.
