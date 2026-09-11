export const titles = ['What should improve?', 'What prevents progress?', 'What actually happens?', 'Where could AI help?', 'Which should we pursue first?', 'What do we recommend?'];
export const shortTitles = ['Goal', 'Gaps', 'Work', 'Candidates', 'Priorities', 'Test'];
export const barrierCategories = ['Missing information', 'Access', 'Authority', 'Incentives', 'Trust', 'Other'];
const ranks = ['First', 'Later', 'Do not pursue'];

export function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
export function control(label, handler, { className = '', mutation = false, disabled = false, pressed } = {}) {
  const node = el('button', label, `control ${className}`.trim()); node.type = 'button';
  if (mutation) node.dataset.mutation = 'true';
  if (disabled) { node.disabled = true; node.dataset.intrinsicDisabled = 'true'; }
  if (pressed !== undefined) node.setAttribute('aria-pressed', String(pressed));
  node.addEventListener('click', handler); return node;
}
function copy(label, text, className = '') {
  const node = el('div', undefined, `fact ${className}`); node.append(el('h3', label), el('p', text || 'Not recorded yet.', text ? '' : 'unrecorded')); return node;
}
function connector(label = '') {
  const node = el('div', undefined, 'diagram-connector');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 80 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M2 12H75M67 5l8 7-8 7'); svg.append(path); node.append(svg);
  if (label) node.append(el('span', label)); return node;
}
function details(label, text) {
  const node = el('details', undefined, 'wording'); node.append(el('summary', label), el('p', text || 'Not recorded yet.')); return node;
}
function editor({ field, label, value, prompt, act, className = '' }) {
  const drafts = act.drafts;
  const node = el('section', undefined, `editable-node ${className}`);
  node.dataset.field = field;
  const heading = el('div', undefined, 'node-heading'); heading.append(el('h3', label));
  const text = el('p', value || prompt, value ? 'node-value' : 'node-value unrecorded');
  function openEditor(focus = true) {
    if (node.querySelector('form')) return;
    const draft = drafts[field] ??= { value: value || '', baseValue: value || '', open: true };
    draft.open = true;
    const form = el('form', undefined, 'single-editor');
    const id = `edit-${field}`; const inputLabel = el('label', prompt); inputLabel.htmlFor = id;
    const input = el('textarea'); input.id = id; input.name = field; input.rows = 3; input.maxLength = 1200; input.value = draft.value; input.required = true; input.dataset.mutation = 'true';
    input.addEventListener('input', () => { draft.value = input.value; });
    const actions = el('div', undefined, 'controls');
    // MCP hosts need not permit native form submission. Dispatch the action
    // from the button so editing also works with sandbox="allow-scripts".
    const submit = () => { const next = input.value.trim(); if (next) act({ kind: 'set_answer', field, value: next }); else input.reportValidity(); };
    const save = control('Save wording', submit, { mutation: true, className: 'primary' });
    const cancel = control('Cancel', () => { delete drafts[field]; form.remove(); text.hidden = false; edit.hidden = false; edit.focus(); });
    actions.append(save, cancel); form.append(inputLabel, input);
    if (draft.baseValue !== (value || '')) form.append(el('p', 'The saved wording changed while this draft was open. Your unsaved wording is retained. Latest saved wording: ' + (value || 'Not recorded.'), 'phase-note'));
    form.append(actions); node.append(form); text.hidden = true; edit.hidden = true; if (focus) input.focus();
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !save.disabled) { event.preventDefault(); submit(); } });
  }
  const edit = control(value ? `Edit ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`, () => openEditor(), { mutation: true, className: 'text-control' });
  heading.append(edit); node.append(heading, text); if (drafts[field]?.open) openEditor(false); return node;
}
function empty(text, ask, request) {
  const node = el('section', undefined, 'empty-activity'); node.append(el('p', text), control('Discuss this in the conversation', () => ask(request), { className: 'primary' })); return node;
}

function goal(ctx) {
  const { answers: a, act } = ctx; const node = el('div', undefined, 'goal-map'); node.dataset.visual = 'goal-map';
  const next = ['outcome', 'kpi', 'baseline', 'guardrail', 'hypothesis'].find(field => !a[field]);
  const show = field => Boolean(a[field]) || next === field;
  if (show('outcome')) node.append(editor({ field: 'outcome', label: 'The change we want', value: a.outcome, prompt: 'What should become better, and for whom?', act, className: 'goal-outcome' }));
  if (show('kpi') || show('baseline')) node.append(connector('We will recognise it through'));
  const measurement = el('div', undefined, 'goal-measurement');
  if (show('kpi')) measurement.append(editor({ field: 'kpi', label: 'Success measure', value: a.kpi, prompt: 'What will you count or time? Give the unit and start/end points.', act }));
  const baseline = editor({ field: 'baseline', label: 'Starting point', value: a.baseline, prompt: 'What is the current result, or how will you find it?', act });
  if (!a.baseline) baseline.append(control('We do not know it yet', () => act({ kind: 'set_answer', field: 'baseline', value: 'Unknown. We need to establish the starting point before claiming improvement.' }), { mutation: true, className: 'choice' }));
  if (show('baseline')) measurement.append(baseline); if (measurement.children.length) node.append(measurement);
  if (show('guardrail')) node.append(editor({ field: 'guardrail', label: 'What must not get worse', value: a.guardrail, prompt: 'Which quality, safety or people outcome must remain protected?', act, className: 'guardrail-node' }));
  if (show('hypothesis')) node.append(editor({ field: 'hypothesis', label: 'Our starting explanation', value: a.hypothesis, prompt: 'What may need to change in how people work?', act, className: 'hypothesis-node' }));
  return node;
}
function gaps(ctx) {
  const { answers: a, record, act, ask } = ctx; const node = el('div', undefined, 'gap-map'); node.dataset.visual = 'relationship-map';
  if (!a.blockers?.length) return empty('Describe one point where people cannot proceed because information or a decision is missing.', ask, 'Ask our group for one information or decision gap, who holds it, and what could make it usable. Ask one question at a time.');
  a.blockers.forEach((gap, index) => {
    const row = el('section', undefined, 'gap-row'); row.dataset.barrierIndex = String(index);
    const chain = el('div', undefined, 'gap-chain'); chain.append(copy('What is needed', gap.information), connector('held by'), copy('Who holds it', gap.holder), connector('can change through'), copy('Practical change', gap.unlock)); row.append(chain);
    row.append(el('p', gap.barrier, 'barrier-wording'));
    const category = record.interaction?.barrierCategories?.[String(index)];
    const choices = el('div', undefined, 'classification'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', `Classify barrier ${index + 1}`);
    barrierCategories.forEach(value => choices.append(control(value, () => act({ kind: 'classify_barrier', index, category: value }), { mutation: true, pressed: category === value, className: 'choice' })));
    row.append(choices); node.append(row);
  });
  node.append(editor({ field: 'firstGap', label: 'Which gap matters first?', value: a.firstGap, prompt: 'Choose the gap most likely to affect your success measure and explain why.', act })); return node;
}
function work(ctx) {
  const { answers: a, record, act, ask } = ctx; const node = el('div', undefined, 'work-map'); node.dataset.visual = 'workflow-replay';
  if (!a.tasks?.length) return empty('Replay one difficult case. Start with the trigger and describe what someone actually did next.', ask, 'Help us replay a recent difficult case in order, including waiting, checking and rework. First ask what triggered the work.');
  if (a.chosenWorkflow) node.append(el('h2', a.chosenWorkflow));
  if (a.recentCase) node.append(details('Read the case', a.recentCase));
  const list = el('ol', undefined, 'task-timeline');
  a.tasks.forEach((task, index) => {
    const item = el('li', undefined, 'task-node'); item.dataset.taskId = task.id;
    const selected = record.interaction?.zeroTaskId === task.id; item.classList.toggle('zero-selected', selected);
    const order = el('div', undefined, 'task-position'); order.append(el('span', String(index + 1), 'sequence-number'));
    const move = shift => { const taskIds = a.tasks.map(t => t.id); [taskIds[index], taskIds[index + shift]] = [taskIds[index + shift], taskIds[index]]; act({ kind: 'reorder_tasks', taskIds }); };
    const up = control('↑', () => move(-1), { mutation: true, disabled: index === 0, className: 'move-control' }); up.setAttribute('aria-label', `Move ${task.work} earlier`);
    const down = control('↓', () => move(1), { mutation: true, disabled: index === a.tasks.length - 1, className: 'move-control' }); down.setAttribute('aria-label', `Move ${task.work} later`); order.append(up, down);
    const body = el('div', undefined, 'task-body'); body.append(el('h3', task.work), el('p', task.actor, 'task-actor'), el('p', task.friction, 'task-friction'));
    body.append(control(selected ? 'Chosen for the zero-second test' : 'Try this task at zero seconds', () => act({ kind: 'choose_zero_task', taskId: task.id }), { mutation: true, pressed: selected, className: 'choice' }));
    item.append(order, body); list.append(item);
  }); node.append(list);
  const selected = a.tasks.find(t => t.id === record.interaction?.zeroTaskId);
  const counterfactual = el('section', undefined, 'counterfactual');
  counterfactual.append(el('h2', selected ? `If “${selected.work}” took no time` : 'What would still prevent the outcome?'));
  counterfactual.append(editor({ field: 'zeroSecond', label: 'The remaining constraint', value: a.zeroSecond, prompt: 'What would still block the goal even if this task took zero seconds?', act }));
  counterfactual.append(editor({ field: 'redesign', label: 'What should change in the workflow?', value: a.redesign, prompt: 'Describe a process change, including one that does not need AI.', act })); node.append(counterfactual); return node;
}
function candidates(ctx) {
  const { answers: a, record, act, ask, state, refresh } = ctx; const node = el('div', undefined, 'candidate-explorer'); node.dataset.visual = 'candidate-comparison';
  if (!a.candidates?.length) return empty('Choose a task from the replay and propose what AI could do. Keep the person’s check and a simpler alternative visible.', ask, 'Ask which recorded workflow step our group would change, what AI would produce and what a person would check. Do not create unrelated candidates.');
  const selected = a.candidates.find(c => c.id === state.candidateId) ?? a.candidates[0];
  const tabs = el('div', undefined, 'candidate-switcher'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Choose a candidate to inspect');
  a.candidates.forEach(c => {
    const status = record.interaction?.candidateDispositions?.[c.id];
    tabs.append(control(`${c.title}${status ? ` · ${status}` : ''}`, () => { state.candidateId = c.id; refresh(); }, { pressed: c.id === selected.id }));
  }); node.append(tabs);
  const taskWords = (selected.taskIds ?? []).map(id => record.phases[2].answers.tasks?.find(task => task.id === id)?.work ?? `Unresolved task ${id}`);
  const source = copy('Work being changed', taskWords.join(' ')); source.classList.add('candidate-origin'); node.append(source, connector());
  const branches = el('div', undefined, 'candidate-branches');
  branches.append(copy('With AI', selected.aiWork, 'ai-branch'), copy('Without AI', selected.nonAiAlternative, 'alternative-branch')); node.append(branches);
  node.append(connector('Both require a judgement'), copy('What people check or decide', selected.humanCheck, 'human-node'));
  const reasoning = el('div', undefined, 'candidate-reasoning'); reasoning.append(copy('Link to the goal', selected.value), copy('What we are assuming', selected.assumption)); node.append(reasoning);
  const disposition = record.interaction?.candidateDispositions?.[selected.id]; const choices = el('div', undefined, 'controls');
  ['Keep', 'Reconsider'].forEach(value => choices.append(control(value, () => act({ kind: 'candidate_disposition', candidateId: selected.id, disposition: value }), { mutation: true, pressed: disposition === value, className: 'choice' })));
  choices.append(control('Discuss a change', () => ask(`Ask what our group would change in candidate ${selected.id}, ${JSON.stringify(selected.title)}. Preserve its existing wording until we answer.`)));
  node.append(choices); return node;
}
function priorities(ctx) {
  const { answers: a, record, act, ask } = ctx; const node = el('div', undefined, 'priority-activity'); node.dataset.visual = 'priority-board';
  const candidates = record.phases[3].answers.candidates ?? [];
  if (!candidates.length) return empty('The board needs the candidates from your work map.', ask, 'Return to the latest incomplete earlier phase and help our group record candidate use cases before prioritising.');
  const choices = candidate => a.choices?.find(c => c.candidateId === candidate.id);
  const priority = candidate => record.interaction?.priorities?.[candidate.id] ?? choices(candidate)?.decision ?? 'Not placed';
  const first = candidates.find(c => priority(c) === 'First');
  if (first) node.append(el('p', `The first proposed test is “${first.title}”. Move it before choosing another First.`, 'board-instruction'));
  else node.append(el('p', 'Place one candidate First, or leave First empty if no AI test is justified.', 'board-instruction'));
  const board = el('div', undefined, 'priority-board');
  const lanes = candidates.some(c => priority(c) === 'Not placed') ? ['Not placed', ...ranks] : ranks;
  lanes.forEach(rank => {
    const lane = el('section', undefined, 'priority-lane'); lane.dataset.priority = rank;
    const members = candidates.filter(c => priority(c) === rank); const heading = el('h2', rank); heading.append(el('span', String(members.length), 'lane-count')); lane.append(heading);
    if (!members.length) lane.append(el('p', rank === 'First' ? 'No first test chosen.' : 'No candidates here.', 'empty-lane'));
    members.forEach(candidate => {
      const card = el('article', undefined, 'priority-candidate'); card.dataset.candidateId = candidate.id; card.append(el('h3', candidate.title));
      const choice = choices(candidate); const unreviewed = Boolean(record.interaction?.priorities?.[candidate.id]);
      if (unreviewed || !choice?.reason || !choice?.evidenceGap) card.append(el('p', 'Reason and missing evidence need group review.', 'needs-reason'));
      if (choice?.reason) card.append(details(unreviewed ? 'Previous reason and missing evidence' : 'Reason and missing evidence', `${choice.reason}\n\n${choice.evidenceGap || 'Missing evidence has not been recorded.'}`));
      const moves = el('div', undefined, 'priority-moves'); moves.setAttribute('role', 'group'); moves.setAttribute('aria-label', `Move ${candidate.title}`);
      ranks.forEach(value => moves.append(control(value, () => act({ kind: 'prioritise', candidateId: candidate.id, priority: value }), { mutation: true, pressed: rank === value, disabled: value === 'First' && Boolean(first && first.id !== candidate.id), className: 'choice' })));
      card.append(moves); lane.append(card);
    }); board.append(lane);
  }); node.append(board);
  node.append(editor({ field: 'challenge', label: 'The strongest challenge to this choice', value: a.challenge, prompt: 'What is the strongest reason against the proposed first test? Include a different group member’s view.', act }));
  node.append(editor({ field: 'costs', label: 'Recurring effort and cost', value: a.costs, prompt: 'What must someone check, maintain or pay for each time? Leave unknown costs visible.', act }));
  node.append(control('Discuss the next missing reason', () => ask('Review our latest recorded priorities. Ask one question about the next missing reason or evidence gap, preserving dissent and recurring costs. Do not invent the answers or approve the phase.'))); return node;
}
function recommendation(ctx) {
  const { answers: a, record, act } = ctx; const node = el('div', undefined, 'recommendation-map'); node.dataset.visual = 'test-decision';
  const branch = el('div', undefined, 'decision-branches'); branch.setAttribute('role', 'group'); branch.setAttribute('aria-label', 'Choose the recommendation');
  branch.append(control('Test a use case', () => act({ kind: 'set_answer', field: 'decision', value: 'Test a use case' }), { mutation: true, pressed: a.decision === 'Test a use case', className: 'decision-choice' }));
  branch.append(control('Do not pilot yet', () => act({ kind: 'set_answer', field: 'decision', value: 'Do not pilot yet' }), { mutation: true, pressed: a.decision === 'Do not pilot yet', className: 'decision-choice' })); node.append(branch);
  if (!a.decision) { node.append(el('p', 'Choose the decision your group is ready to recommend. Neither choice approves this chapter.', 'decision-guidance')); return node; }
  if (a.decision === 'Test a use case') {
    const firstIds = new Set((record.phases[4].answers.choices ?? []).filter(choice => choice.decision === 'First').map(choice => choice.candidateId));
    const first = (record.phases[3].answers.candidates ?? []).filter(candidate => firstIds.has(candidate.id));
    const chosen = el('div', undefined, 'test-candidate'); chosen.append(el('h3', 'Use case from the shortlist'));
    first.forEach(candidate => chosen.append(control(candidate.title, () => act({ kind: 'set_answer', field: 'candidateId', value: candidate.id }), { mutation: true, pressed: a.candidateId === candidate.id, className: 'choice' })));
    if (!first.length) chosen.append(el('p', 'Return to the shortlist and choose First before proposing a test.', 'unrecorded')); node.append(chosen);
    if (!a.candidateId) return node;
  }
  const next = ['owner', 'evidence', 'test', 'stopRule', 'peopleChange', 'recommendation'].find(field => !a[field]);
  const show = field => Boolean(a[field]) || next === field;
  const scope = el('div', undefined, 'test-scope');
  if (show('owner')) scope.append(editor({ field: 'owner', label: 'Accountable owner', value: a.owner, prompt: 'Which role would own the decision? Mark the owner as proposed if agreement is missing.', act }));
  if (show('evidence')) scope.append(editor({ field: 'evidence', label: 'What the evidence supports', value: a.evidence, prompt: 'Which observation connects this recommendation to your goal? Which permission or proof is still missing?', act })); if (scope.children.length) node.append(scope);
  if (show('test')) { node.append(connector('Before deciding whether to continue')); node.append(editor({ field: 'test', label: a.decision === 'Do not pilot yet' ? 'What would justify reconsidering?' : 'The bounded comparison', value: a.test, prompt: 'What sample, comparator and review point will test the assumption? Include total effort and model cost.', act, className: 'comparison-node' })); }
  if (show('stopRule')) node.append(editor({ field: 'stopRule', label: 'Stop or revise when', value: a.stopRule, prompt: 'What specific observation would make you stop? Protect the safeguard from Step 1.', act, className: 'stop-node' }));
  if (show('peopleChange')) node.append(editor({ field: 'peopleChange', label: 'What changes for people', value: a.peopleChange, prompt: 'Who gains new checking work, and what will people do with any time released?', act }));
  if (show('recommendation')) node.append(editor({ field: 'recommendation', label: 'The group’s recommendation', value: a.recommendation, prompt: 'What do you want the decision-maker to agree to, and why?', act })); return node;
}

export function createActivity({ record, phaseId, onAction, onAsk, state = {}, refresh = () => {} }) {
  const phase = record.phases[phaseId - 1];
  const act = action => onAction({ ...action, phaseId, expectedRevision: record.revision });
  act.drafts = state.editors ??= {};
  const context = { record, answers: phase.answers, state, refresh, act, ask: onAsk };
  const node = [goal, gaps, work, candidates, priorities, recommendation][phaseId - 1](context);
  node.dataset.phase = String(phaseId); node.classList.add('activity'); return node;
}
