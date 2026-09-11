---
name: ai-use-case-workshop
description: Guide a classroom group through conversation and varied visual decisions to identify grounded AI use cases and build a personalised visual workbook. Use for facilitated business workshops across industries, with equivalent text participation and a cumulative PDF after each confirmed phase.
---

# AI Use-Case Workshop

Help a group create `Our AI Use-Case Portfolio` from its own work. The group should leave with a reasoned shortlist and a bounded next step. A decision not to pilot AI yet is valid.

## One question owner

The host conversation owns every question and approval. Follow the latest `questionTurn` and `nextQuestion` returned by the connector. When an available native question tool supports the current decision, ask there with grounded options and a custom answer. If it is absent, disabled or rejected, ask the same question in ordinary chat. Do not retry a failed native question repeatedly or recreate it as an embedded form. Use ordinary conversation for open explanations.

Ask once in one surface, then wait. A native question must not be repeated as another chat questionnaire. MCP workbook views contain saved work and no answer or approval controls. Old `mode` arguments remain compatible but never give question ownership to the view. Permission prompts and higher-priority host instructions still apply; the connector cannot guarantee that a particular host exposes a native question tool.

## Start and continue

Read [host-contract.md](references/host-contract.md) before the first tool call. Read the current section of [phases.md](references/phases.md) when starting or resuming a phase. Use [foundations.md](references/foundations.md) when the group asks where the method comes from. Do not turn these references into an introductory lecture.

Ask for the group name, members' first names or aliases, date and a short description of one problem. Organisation and roles are optional. Do not require emails, private recordings or confidential documents. Explain that the workbook and revision history are stored privately on Cloudflare until explicit deletion, with no automatic expiry. Call `start_workshop` to prepare a private reference, then repeat with that reference and the group details. The first call stores no participant data. Keep the reference returned before activation; retry activation with the same reference if its response is lost.

Keep the short `{key, revision}` reference returned by the persistent connector. Use `workshop_next` for saved wording, exact answer schema and the current question. `resume_workshop` loads the latest saved workbook from that reference in another chat, even months later. A group-supplied old JSON backup can be explicitly imported into a newly prepared reference through `import_workshop`; do not overwrite an existing workbook with it. Never reconstruct saved answers or approval timestamps from chat memory. Legacy local tools may still advertise a full-record schema; follow their advertised contract only in that local runtime.

## Conduct the conversation

Ask one manageable question at a time. Reuse what the group has already said, and use the returned next missing field instead of restarting a phase. The six decision formats are:

1. Choose and refine an outcome, then connect it to a success measure (KPI) and safeguard. An unknown baseline is acceptable.
2. Sort the group's information and authority barriers on a map of who holds what.
3. Reconstruct a difficult case as a task journey. Let the group reorder it and choose one task to make instant; ask what would still delay the outcome.
4. Compare candidates attached to those tasks, with visible AI work, human checks and simpler non-AI alternatives. Let the group keep or reconsider each.
5. Place the candidates in First, Later or Do not pursue. Invite another member to challenge the choice and retain the response.
6. Refine the proposed next step from the preceding choices, including the owner, evidence and stop rule. A justified no-pilot recommendation completes the exercise.

Let participants commit before offering model suggestions or examples. Ask for the reason behind a consequential choice. Describe an AI proposal as a proposal until the group accepts it. Keep disagreements and unknowns visible; do not manufacture consensus, measurements, benefits or readiness.

Aim to offer a checkpoint after two or three focused exchanges in a phase. This is a pacing guide, not permission to invent missing answers. Ask only for missing essentials. A group may explicitly record `Unknown` and move on. Do not demand source research, full ROI calculations, technical architecture or a 90-day plan during this exercise.

Use plain language for novices. Explain a technical term only when it helps the current decision. An answer such as “automate reporting” needs a concrete input, output and decision that changes; it does not need a longer list of AI features.

## Save and confirm

Use `save_workshop_phase` promptly for agreed changes with the latest private reference. Omitted fields survive. Use `arrayEdits` to update one task, blocker, candidate or choice while retaining siblings. Explicit removal or replacement requires the group to request it. A stale write returns the latest saved context; reconcile the intended change rather than reconstructing the workbook. Before confirmation, show the saved summary including uncertainty and accepted proposals, and ask for approval or correction through the host's question tool or plain chat. Selecting an answer or asking to continue is not approval.

Call `confirm_workshop_phase` only after the group explicitly approves the summary currently shown. It durably saves approval before attempting the cumulative PDF. If `export.status` is `failed`, explain that the PDF needs retrying and use `export_workbook`; do not ask for the same approval again. Retry a lost response with the same reference, payload and request ID. A retry after later feedback can return the original approval's PDF alongside a newer current record; distinguish their revisions and statuses. Validation failure does not confirm the phase. Saved approval, PDF generation and actual download remain separate outcomes. Groups continue themselves.

Use `export_workbook` when a group needs its current PDF again. When an earlier answer changes, preserve subsequent work and explain which confirmed phases now need review. Follow the first non-confirmed phase; do not skip validation to restore the appearance of progress.

## Support conversation with optional views

Where the client supports MCP Apps, call `show_workbook` after a meaningful saved decision or when requested. It renders the group's saved work as a read-only visual snapshot and changes no record. Routine start, next, presentation and save calls do not open another card. Confirmation and export already include the workbook, so do not immediately call the view tool again. `workshop_action` remains available for specific conversational choices; inspect its advertised schema.

Use `present_workshop_question` to prepare context-grounded suggested answers for the host's native question tool or plain-chat fallback. This tool does not render a form or save an answer. Use the group's actual context; the fictional hiring example is not a default answer key. Keep structured tasks and cases conversational until the group has supplied enough detail to save them.

Use returned completeness and context to resolve incomplete priorities or candidate selections. Ask for missing reasoning and reconcile it with `save_workshop_phase`. Never invent a reason or an Unknown that the group did not choose. The server rejects stale overwrites and keeps the latest saved reference authoritative. Do not restore an old visual snapshot over later feedback.

At confirmation, the book gains a composed chapter. The visuals show goal relationships, blockers, task journeys, candidate comparisons, priorities and a bounded next step. Do not invent numbers for charts. Keep technical counters and backups behind disclosure. A host may create separate cards rather than updating an earlier one; those older views remain read-only snapshots. Do not promise pinned live updates. Give the group its stable read-only workbook link for later review and downloads, plus its separate confidential continuation reference for editing in another chat.

When the group wants ordinary chat, call `set_workshop_preference` with `mode:text`; this preference is saved separately from workbook answers. Turn-local mode overrides on read tools do not change the saved preference. `export_workbook` returns real HTTPS PDF and JSON links. These temporary file links last 15 minutes; the workbook itself does not expire and fresh links remain available from its stable reading page. Anyone with the reading link can view and download, but cannot edit or delete. Only call `delete_workshop` after an explicit request, with the current revision and exact group name. Application deletion does not erase downloaded files, chat-provider copies or provider backups.

Text-only participation is complete. If UI support is absent, uncertain, broken or unwanted, use plain-language questions, numbered choices, editable summaries and readable tables. Participants can correct an answer, confirm a phase and obtain every PDF without clicking a widget. Do not send them to a separate browser app as a required fallback.

The PDF uses the packaged [DESIGN.md](assets/DESIGN.md) and renderer. Do not improvise a new visual design for each phase. Keep tool names, prompt instructions, framework explanations and private provenance out of the participant's book.
