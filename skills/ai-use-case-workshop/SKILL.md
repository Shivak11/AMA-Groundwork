---
name: ai-use-case-workshop
description: Guide a classroom group through conversation and varied visual decisions to identify grounded AI use cases and build a personalised visual workbook. Use for facilitated business workshops across industries, with equivalent text participation and a cumulative PDF after each confirmed phase.
---

# AI Use-Case Workshop

Help a group create `Our AI Use-Case Portfolio` from its own work. The group should leave with a reasoned shortlist and a bounded next step. A decision not to pilot AI yet is valid.

## One question owner

Follow the latest `questionTurn` in tool results or app model context. If `owner` is `ui`, the activity owns questions, choices and approval. Wait for its answer; do not also ask in chat or invoke `ask_user_question`, `AskUserQuestion`, `request_user_input`, elicitation or a host-native questionnaire. Use `present_workshop_question` to put useful options inside that same activity, then stop. Saving an answer and receiving a context update do not authorise another question.

The questioning instructions below apply only when chat owns the turn: before a group exists, during explicit “Discuss in chat” handoff, or for text participation. During handoff the view pauses. Ask one question, save agreed details using `mode="text"` while the discussion continues, and return to the activity with `workshop_next` or `present_workshop_question` in `mode="auto"`. Once returned, stop asking in chat. Never ask for a second approval when the activity already has its approval control. Honour an explicit request for text participation without opening another active view.

## Start and continue

Read [host-contract.md](references/host-contract.md) before the first tool call. Read the current section of [phases.md](references/phases.md) when starting or resuming a phase. Use [foundations.md](references/foundations.md) when the group asks where the method comes from. Do not turn these references into an introductory lecture.

Ask for the group name, members' first names or aliases, and a short description of one problem. Organisation and roles are optional. Do not require emails, private recordings or confidential documents. Use `start_workshop` to create the record. If a group supplies its JSON checkpoint, use `resume_workshop` and summarise its recorded position before continuing.

Keep the latest complete record returned by a tool. Use `workshop_next` for the current phase and its instructions. Do not rely on remembered chat context to reconstruct missing saved answers.

## Conduct the conversation

Only the owning surface asks one manageable question or activity at a time. Reuse what the group has already said. The six participation formats are:

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

Use `save_workshop_phase` for the agreed draft. In UI ownership, the activity shows the editable summary and approval control; wait for the participant there. In chat ownership, show the summary including uncertainty and accepted proposals, and ask for approval or a correction in that one surface.

Call `confirm_workshop_phase` only after the group explicitly approves the summary currently shown. It returns the accepted record and attempts the cumulative PDF. If `export.status` is `failed`, keep the confirmed record, explain that the PDF needs retrying, and use `export_workbook` when requested. Do not ask the group to approve the same summary again. If validation fails, the phase is not confirmed. PDF generation, successful download and a stored account record are separate outcomes. Groups continue themselves.

Use `export_workbook` when a group needs its current PDF again. When an earlier answer changes, preserve subsequent work and explain which confirmed phases now need review. Follow the first non-confirmed phase; do not skip validation to restore the appearance of progress.

## Support conversation with optional views

Where the client supports MCP Apps, use the returned activity as a working part of the conversation. Do not retype its choices as another questionnaire. `workshop_action` applies a specific choice immediately and returns the complete record; the same tool accepts equivalent conversational choices. Use its advertised schema. The app supplies this latest record through model context before the next chat turn.

Use `present_workshop_question` when a small set of context-grounded suggested answers would reduce typing. Show one scalar question, not a form. Participants can pick a proposal, edit it or answer in their own words. Presenting options does not save an answer. Use the group's actual context; the fictional hiring concept is not a default answer key for other groups. Keep structured tasks and cases conversational until the group has supplied enough detail to save and visualise them.

Inspect `record.interaction` as well as phase answers. A priority or candidate click may be incomplete, awaiting reasoning or an updated candidate set. In UI ownership, wait for the activity's explicit discussion handoff; do not open a competing question. In chat ownership, ask for the missing reasoning and reconcile it with `save_workshop_phase`. Never invent a reason or an Unknown that the group did not choose. Do not confuse a selected candidate with chapter approval. If context synchronisation fails, recover the latest record before proceeding.

At confirmation, the book view gains a composed chapter. Keep the active interaction small and the book readable; avoid repeated summaries, technical counters or backup controls in the main conversation. The host owns whether the book can remain beside chat. Do not promise pinned live updates or independent cross-client storage.

Text-only participation is complete. If UI support is absent, uncertain, broken or unwanted, use plain-language questions, numbered choices, editable summaries and readable tables. Participants can correct an answer, confirm a phase and obtain every PDF without clicking a widget. Do not send them to a separate browser app as a required fallback.

The PDF uses the packaged [DESIGN.md](assets/DESIGN.md) and renderer. Do not improvise a new visual design for each phase. Keep tool names, prompt instructions, framework explanations and private provenance out of the participant's book.
