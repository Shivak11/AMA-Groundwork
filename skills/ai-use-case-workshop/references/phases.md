# Phase guidance

Use only the current phase in conversation. The questions below are examples, not a script to recite. One conversational move may answer several fields. Reuse it rather than asking again. After a short exchange, offer an editable checkpoint. Record a group-approved unknown when evidence is unavailable.

## Phase 1: What should improve?

Begin with a sentence completion: “We want ___ to improve for ___, without making ___ worse.” Ask the group to supply its own words before showing an example.

Follow the chosen outcome with one practical question: “What would you look at to know whether this had improved?” If there is no existing measure, record a proposed measure and mark the baseline unknown. Ask what change the group thinks could improve it; keep this as a hypothesis, even when participants are confident.

Required answers are `outcome`, `kpi`, `baseline`, `guardrail` and `hypothesis`. The guardrail describes something that must not worsen. A baseline needs its source or its uncertainty in the same answer; estimates must be labelled.

Show a short problem card in a supported view. In text, show the completed sentence and a compact table of measure, current position, safeguard and proposed change. Invite one correction before asking for approval.

If the group jumps directly to a tool, ask which outcome would change when somebody uses its output. Do not erase its idea; retain it as a hypothesis to test against the workflow.

## Phase 2: What prevents progress?

Ask each group to name information needed for its outcome and who holds it. Offer a sorting move: “For each item, is it missing, inaccessible, disputed, or waiting for someone with authority to decide?” More than one description can apply. Let participants rename the categories when their case needs it.

Ask what would make the most consequential item usable. This could be permission, an agreed definition, an owner, a change in incentives or a better record. Do not assume a connector resolves unwillingness to share information or disagreement about its meaning.

Required answers are `blockers`, containing one to five objects with `information`, `holder`, `barrier` and `unlock`, and `firstGap`. The first gap is the one the group would address first, with its reason. A holder can be a role or team; a real person's name is unnecessary.

Use a barrier table in either mode. In text, participants can say “Change item 2” or “Make item 1 our first gap.” Treat numbered choices as references to visible items, not as an automatic numerical score.

## Phase 3: What actually happens?

Ask the group to name up to three workflows that affect its outcome and choose one to examine. If it already named one concrete workflow, confirm that choice rather than demanding alternatives.

Invite a recent difficult case: “Take one request or case that involved a delay or rework. What happened first, and what happened after that?” Reconstruct the sequence from the group’s account. Ask about the hand-off or wait with the largest consequence. Include searching, checking, messages and informal work when participants describe them. Avoid inventing timestamps or filling unexplained gaps with an official process.

Then ask the zero-second question: “If the slow task you named took no time, what would still prevent the outcome?” Let the group answer before suggesting that a surrounding step may need to change.

Required answers are `workflows`, `chosenWorkflow`, `recentCase`, `tasks`, `zeroSecond` and `redesign`. There are one to three workflows and two to six tasks. Each task has a stable `id`, an `actor`, the `work` and its `friction`. Ask the group what it would remove, change or create if redesign were possible; record that in `redesign`. “No redesign proposed yet” is an acceptable explicit position.

Use a chronological view where available. The full text equivalent is an ordered list or a table with actor, work and delay or rework. Preserve task IDs during edits so later use-case references remain understandable.

## Phase 4: Where could AI help?

First ask participants to nominate a useful change based on the recorded case. They may describe an AI use, new work or a change that does not require AI. Then offer a small set of candidate proposals drawn from their evidence. For each proposal, ask the group to keep it, change it or reject it. Invite a missing candidate rather than treating the model's list as complete.

Aim for three to five grounded candidates when the case supports them. One is sufficient when more would be speculative. Describe what AI would actually do, whose action would change and how someone would check the result. Ask whether a simpler rule, form or process change could address the same problem.

Required `candidates` contain one to five objects with `id`, `title`, `taskIds`, `aiWork`, `value`, `humanCheck`, `nonAiAlternative` and `assumption`. Link each candidate to existing task IDs. Genuinely new work can have an empty `taskIds` array, with the dependency explained in `assumption`. Do not keep a rejected model suggestion as an agreed candidate.

Show reusable cards attached to the recorded work where supported. In text, number the candidates and show the same content in short sections. Ask the group to examine one important weakness before approving the set.

If the case suggests no sensible AI use, do not force a claim of benefit. A candidate can examine the proposed AI option honestly, with its weak rationale and stronger non-AI alternative recorded. The next phase can reject it and the final recommendation can be “Do not pilot yet.”

## Phase 5: Which should we pursue first?

Ask the group to compare the actual candidates. Each must receive `First`, `Later` or `Do not pursue`, with a reason and the evidence still missing. At most one candidate can be first; choosing none is valid.

After the group makes its initial choice, invite another member to challenge it: “What would make our first choice fail, or make a deferred choice more useful?” In a solo group, ask the participant to make the strongest case against the choice. Record the counterargument and whether it changed the decision. Do not infer a person's motives or score the quality of their judgement.

Ask about ongoing costs in concrete terms: model or software use, human checking, exceptions, maintenance and the effort needed to keep information current. Do not convert time saved into cash unless the group identifies what spending would actually fall.

Required answers are `choices`, `challenge` and `costs`. Include exactly one choice for each candidate, with `candidateId`, `decision`, `reason` and `evidenceGap`. Unavailable cost figures remain unknown; participants can still name the recurring work. Do not average away a serious uncontrolled risk with a high benefit rating.

Use a side-by-side comparison when supported. Text uses the same candidate order and a readable table. Present the dissent alongside the final ordering in the checkpoint summary.

## Phase 6: What do we recommend?

Ask the group to make a short recommendation that it could explain to a colleague who missed the workshop. Bring forward the current shortlist, supporting evidence and challenge. Invite participants to revise the conclusion if these do not support a pilot.

For a pilot, ask who would own the next decision, what a small bounded test would do, and what result would make the group stop. An owner can be a proposed role with confirmation pending. Include the people whose work, checking responsibility or decision authority would change.

For no pilot, ask what useful evidence or non-AI change should happen next. This is a finished recommendation, not an incomplete worksheet.

Required answers are `decision`, `candidateId`, `owner`, `evidence`, `peopleChange`, `test`, `stopRule` and `recommendation`. The decision is `Test a use case` or `Do not pilot yet`. A pilot references the single candidate marked `First`; a no-pilot decision uses `null` for `candidateId`. In a no-pilot path, `test` describes the next evidence or non-AI step and `stopRule` states when to stop that step or reconsider the recommendation. Do not invent an approval or assign work to someone outside the group.

Show the final recommendation and the accumulated workbook preview where supported. In text, give the same editable summary and offer corrections. After explicit approval and successful PDF generation, provide the final book and JSON backup. Briefly name any unresolved assumption that materially affects the recommendation; do not add a closing lecture or a personality assessment.

## Optional comparison case

This is a fictional shared-services example for use only after the group commits, or when it asks for help understanding an activity. Never copy these answers into a participant record without the group deliberately choosing a fictional practice case. Say clearly when the exercise uses invented data.

A shared-services group handles internal equipment requests. Its staff say requests are repeatedly returned for missing information, but they have not measured the baseline. In one fictional case, a request reaches IT without the intended start date, is sent back, and then waits for a budget owner after the missing date arrives.

The outcome statement could concern fewer returned requests while preserving approval checks. The barrier sort might separate an absent start date from a budget decision. The chronology allows the group to notice that instant drafting would leave the approval wait unchanged. A candidate to check for missing fields should be compared with a mandatory form; summarising a request is not permission to approve it.

For prioritisation, ask what evidence would distinguish an AI check from the simpler form. A group could reasonably recommend testing a small sample, changing the form first, or delaying an AI pilot. Do not present one of these as the answer that a good group should reach.
