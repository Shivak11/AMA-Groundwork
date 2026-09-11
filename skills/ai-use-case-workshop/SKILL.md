---
name: ai-use-case-workshop
description: Guide a classroom group through six short conversations to identify and prioritise grounded AI use cases, with an approved cumulative PDF after each phase. Use for facilitated business workshops across industries, including groups using text-only MCP clients.
---

# AI Use-Case Workshop

Help a group create `Our AI Use-Case Portfolio` from its own work. The group should leave with a reasoned shortlist and a bounded next step. A decision not to pilot AI yet is valid.

## Start and continue

Read [host-contract.md](references/host-contract.md) before the first tool call. Read the current section of [phases.md](references/phases.md) when starting or resuming a phase. Use [foundations.md](references/foundations.md) when the group asks where the method comes from. Do not turn these references into an introductory lecture.

Ask for the group name, members' first names or aliases, and a short description of one problem. Organisation and roles are optional. Do not require emails, private recordings or confidential documents. Use `start_workshop` to create the record. If a group supplies its JSON checkpoint, use `resume_workshop` and summarise its recorded position before continuing.

Keep the latest complete record returned by a tool. Use `workshop_next` for the current phase and its instructions. Do not rely on remembered chat context to reconstruct missing saved answers.

## Conduct the conversation

Ask one manageable question or activity at a time. Reuse what the group has already said. The six participation formats are:

1. Complete an outcome statement and choose how to recognise improvement.
2. Sort concrete information and authority barriers.
3. Reconstruct one difficult recent case, including waits and hand-offs.
4. Review candidate use cases against particular workflow steps.
5. Compare priorities and invite a member to argue against the first choice.
6. Agree a recommendation, a proposed owner and a small test, or explain why a pilot should wait.

Let participants commit before offering model suggestions or examples. Ask for the reason behind a consequential choice. Describe an AI proposal as a proposal until the group accepts it. Keep disagreements and unknowns visible; do not manufacture consensus, measurements, benefits or readiness.

Aim to offer a checkpoint after two or three focused exchanges in a phase. This is a pacing guide, not permission to invent missing answers. Ask only for missing essentials. A group may explicitly record `Unknown` and move on. Do not demand source research, full ROI calculations, technical architecture or a 90-day plan during this exercise.

Use plain language for novices. Explain a technical term only when it helps the current decision. An answer such as “automate reporting” needs a concrete input, output and decision that changes; it does not need a longer list of AI features.

## Save and confirm

Use `save_workshop_phase` for the agreed draft. Then show a short, editable summary including uncertainty and any model suggestions the group has accepted. Ask whether the group approves this summary for its workbook or wants a correction.

Call `confirm_workshop_phase` only after the group explicitly approves the summary that is currently shown. A successful confirmation returns the cumulative PDF and JSON checkpoint. Offer both and state the completed phase. If the tool fails, do not claim the phase is completed or a PDF exists; retain the draft and follow the returned recovery instruction. Groups continue themselves once confirmation succeeds.

Use `export_workbook` when a group needs its current PDF again. When an earlier answer changes, preserve subsequent work and explain which confirmed phases now need review. Follow the first non-confirmed phase; do not skip validation to restore the appearance of progress.

## Support conversation with optional views

Where the actual client supports MCP Apps, the shared views can make a problem card editable, show the case chronology, attach use-case cards to work, compare priorities and preview a checkpoint. A visual action must become a visible, revision-labelled request using the same tools and record.

Text-only participation is complete. If UI support is absent, uncertain, broken or unwanted, use plain-language questions, numbered choices, editable summaries and readable tables. Participants can correct an answer, confirm a phase and obtain every PDF without clicking a widget. Do not send them to a separate browser app as a required fallback.

The PDF uses the packaged [DESIGN.md](assets/DESIGN.md) and renderer. Do not improvise a new visual design for each phase. Keep tool names, prompt instructions, framework explanations and private provenance out of the participant's book.
