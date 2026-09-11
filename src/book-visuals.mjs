export const bookStepTitles = [
  'What should improve?', 'What prevents progress?', 'What actually happens?',
  'Where could AI help?', 'Which should we pursue first?', 'What do we recommend?',
];

export const bookProfileUrl = 'https://www.shivakakkar.com/';

export function escapeBookText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const recorded = value => value === null || value === undefined || value === '' ? 'Not recorded' : value;
const answer = value => `<p class="answer">${escapeBookText(recorded(value))}</p>`;
const node = (label, value, className = '') => `<section class="diagram-node ${className}"><h3>${escapeBookText(label)}</h3>${answer(value)}</section>`;
const connector = '<div class="diagram-connector" aria-hidden="true"><span></span></div>';
const phaseOf = (record, id) => record.phases.find(phase => phase.id === id);
const answersOf = (record, id) => {
  const phase = phaseOf(record, id);
  return phase && phase.status !== 'draft' ? phase.answers : {};
};
const field = (label, value, className = '') => `<section class="book-field ${className}"><h3>${escapeBookText(label)}</h3>${answer(value)}</section>`;
const candidateTitle = (record, id) => answersOf(record, 4).candidates?.find(candidate => candidate.id === id)?.title ?? (id ? `Use case ${id} (needs review)` : 'Not recorded');

export function bookHasLongAnswer(value) {
  if (typeof value === 'string') return value.length > 500;
  if (Array.isArray(value)) return value.some(bookHasLongAnswer);
  if (value && typeof value === 'object') return Object.values(value).some(bookHasLongAnswer);
  return false;
}

export function renderBookCover(record) {
  const { group } = record;
  const first = phaseOf(record, 1);
  const confirmed = record.phases.filter(phase => phase.status === 'confirmed').length;
  const review = record.phases.filter(phase => phase.status === 'needs_review').length;
  const progress = `${confirmed} of 6 phases confirmed.${review ? ` ${review} ${review === 1 ? 'phase needs' : 'phases need'} review.` : ''}`;
  const outcome = first && first.status !== 'draft' ? first.answers.outcome : null;
  const status = phase => phase.status === 'confirmed' ? 'Confirmed' : phase.status === 'needs_review' ? 'Needs review' : 'Not yet confirmed';
  return `<section class="cover visual-cover" aria-labelledby="book-title">
    <h1 id="book-title">Our AI Use-Case Portfolio</h1>
    <section class="cover-problem" aria-labelledby="cover-problem-title"><h2 id="cover-problem-title">The problem we are examining</h2>${answer(group.problem)}</section>
    <div class="cover-group"><h2 class="group-name answer">${escapeBookText(group.name)}</h2><p class="members answer">${escapeBookText(group.members.join(', '))}</p></div>
    ${outcome ? `<section class="cover-outcome"><h2>The outcome we want</h2>${answer(outcome)}${first.status === 'needs_review' ? '<p class="cover-review">This outcome needs review because an earlier answer changed.</p>' : ''}</section>` : '<p class="cover-start">The group has not confirmed an outcome yet.</p>'}
    ${group.context ? `<p class="context answer">${escapeBookText(group.context)}</p>` : ''}
    <div class="cover-bottom"><p class="progress-copy">${progress}</p><ol class="phase-index">${record.phases.map(phase => `<li class="state-${phase.status === 'confirmed' ? 'confirmed' : phase.status === 'needs_review' ? 'review' : 'draft'}"><span class="index-number" aria-hidden="true">${phase.id}</span><span><span class="index-title">${escapeBookText(bookStepTitles[phase.id - 1])}</span><span class="index-state">${status(phase)}</span></span></li>`).join('')}</ol></div>
    <div class="cover-credit"><p class="cover-authorship">Prepared by Dr. Shiva Kakkar</p><a href="${bookProfileUrl}">Click here to access the author’s profile</a><p class="cover-date">${escapeBookText(group.date)}</p></div>
  </section>`;
}

function renderGoal(a) {
  return [
    `<div class="goal-diagram" data-book-visual="goal" aria-label="The outcome, its success measure and safeguards">${node('The outcome we want', a.outcome, 'goal-outcome')}</div>`,
    `${connector}<div class="measure-connection">${node('How we will measure it', a.kpi, 'goal-measure')}${node('What we know about the baseline', a.baseline, 'goal-baseline')}</div>`,
    `${connector}${node('What must not get worse', a.guardrail, 'goal-guardrail')}`,
    node('What may need to change in how we work', a.hypothesis, 'goal-hypothesis'),
  ];
}

function renderGaps(record, a) {
  const categories = record.interaction?.barrierCategories ?? {};
  const routes = (a.blockers ?? []).map((gap, index) => `<section class="gap-route">
    <h3 class="gap-information answer">${escapeBookText(recorded(gap.information))}</h3>
    <div class="gap-holder"><h4>Who holds it</h4>${answer(gap.holder)}</div>
    <div class="gap-barrier"><h4>What prevents progress</h4>${answer(gap.barrier)}${categories[index] ? `<p class="recorded-choice">Group classification: ${escapeBookText(categories[index])}</p>` : ''}</div>
    <div class="gap-unlock"><h4>What would unlock it</h4>${answer(gap.unlock)}</div>
  </section>`);
  return [
    ...(routes.length ? routes : [answer(null)]).map(route => `<div class="gap-map" data-book-visual="gap-map" aria-label="Information, its holder, the barrier and a practical change">${route}</div>`),
    field('The first gap to address', a.firstGap, 'first-gap'),
  ];
}

function renderJourney(record, a) {
  const selected = record.interaction?.zeroTaskId;
  const selectedTask = (a.tasks ?? []).find(task => task.id === selected);
  const tasks = (a.tasks ?? []).map((task, index) => `<li${task.id === selected ? ' class="selected-zero-task"' : ''}>
    <span class="journey-number" aria-hidden="true">${index + 1}</span>
    <div class="journey-work"><h4 class="answer">${escapeBookText(recorded(task.actor))}</h4>${answer(task.work)}${task.id === selected ? '<p class="recorded-choice">Selected for the zero-second test</p>' : ''}</div>
    <div class="journey-friction"><h4>Delay or difficulty</h4>${answer(task.friction)}</div>
  </li>`).join('');
  return [`<section class="workflow-selection"><h3>The workflows we considered</h3><ul>${(a.workflows ?? []).map(workflow => `<li${workflow === a.chosenWorkflow ? ' class="chosen-workflow"' : ''}><p class="answer">${escapeBookText(workflow)}</p>${workflow === a.chosenWorkflow ? '<span class="workflow-choice">Chosen by the group</span>' : ''}</li>`).join('')}</ul></section>
    ${(a.workflows ?? []).includes(a.chosenWorkflow) ? '' : field('The workflow we chose', a.chosenWorkflow, 'chosen-workflow-field')}
    ${field('The difficult case we replayed', a.recentCase, 'case-replay')}`,
    `<section class="task-journey" data-book-visual="task-journey"><h3>The work in its recorded order</h3><ol class="work-journey">${tasks}</ol></section>`,
    `<section class="zero-comparison" data-book-visual="zero-second"><h3>The zero-second test</h3>${selectedTask ? `<div class="zero-selected"><h4>The task the group selected</h4>${answer(selectedTask.work)}</div>` : selected ? `<p class="review-note">The selected task ${escapeBookText(selected)} is no longer in this work map. Review the selection.</p>` : ''}<div class="zero-remaining"><h4>What would remain if the work took zero seconds</h4>${answer(a.zeroSecond)}</div><div class="zero-redesign"><h4>What the workflow may need instead</h4>${answer(a.redesign)}</div></section>`];
}

function renderCandidates(record, a) {
  const tasks = answersOf(record, 3).tasks ?? [];
  const dispositions = record.interaction?.candidateDispositions ?? {};
  return (a.candidates ?? []).map((candidate, candidateIndex) => {
    const attached = (candidate.taskIds ?? []).map(id => {
      const index = tasks.findIndex(task => task.id === id);
      return index < 0 ? `<li class="answer">Task ${escapeBookText(id)} has no confirmed link in the current work map. This link needs review.</li>` : `<li><span class="task-reference">Task ${index + 1}</span>${answer(tasks[index].work)}</li>`;
    });
    const long = bookHasLongAnswer(candidate) || (candidate.taskIds ?? []).some(id => bookHasLongAnswer(tasks.find(task => task.id === id)));
    return `<div class="candidate-atlas${candidateIndex ? ' candidate-atlas-continuation' : ''}" data-book-visual="candidate-work-map"><section class="candidate-map${long ? ' long-candidate' : ''}"><h3 class="candidate-title answer">${escapeBookText(candidate.title)}</h3>${dispositions[candidate.id] ? `<p class="recorded-choice">Group choice: ${escapeBookText(dispositions[candidate.id])}</p>` : ''}
      <div class="candidate-route"><div class="candidate-input"><h4>The recorded work</h4>${attached.length ? `<ul>${attached.join('')}</ul>` : '<p>No task link recorded.</p>'}</div><div class="candidate-ai"><h4>What AI would do</h4>${answer(candidate.aiWork)}</div><div class="candidate-human"><h4>What a person must check or decide</h4>${answer(candidate.humanCheck)}</div></div>
      <div class="candidate-comparator"><h4>What we could do without AI</h4>${answer(candidate.nonAiAlternative)}</div>
      <div class="candidate-case"><div><h4>How this could improve the outcome</h4>${answer(candidate.value)}</div><div><h4>What we are assuming</h4>${answer(candidate.assumption)}</div></div>
    </section></div>`;
  });
}

export function renderBookPriorityRows(record) {
  const a = answersOf(record, 5);
  return ['First', 'Later', 'Do not pursue'].map(decision => {
    const choices = (a.choices ?? []).filter(choice => choice.decision === decision);
    return `<tbody class="priority-${decision === 'First' ? 'first' : decision === 'Later' ? 'later' : 'stop'}"><tr class="priority-band"><th colspan="3" scope="rowgroup">${escapeBookText(decision)}</th></tr>${choices.length ? choices.map(choice => `<tr class="priority-entry"><th scope="row" data-label="Use case" class="answer">${escapeBookText(candidateTitle(record, choice.candidateId))}</th><td data-label="Our reason" class="answer">${escapeBookText(recorded(choice.reason))}</td><td data-label="Evidence still needed" class="answer">${escapeBookText(recorded(choice.evidenceGap))}</td></tr>`).join('') : '<tr><td colspan="3" class="empty-decision">No candidate recorded here.</td></tr>'}</tbody>`;
  }).join('');
}

function renderPriorities(record, a) {
  return [`<table class="priority-map" data-book-visual="priority-comparison"><caption>The group’s priorities</caption><thead><tr><th scope="col">Use case</th><th scope="col">Our reason</th><th scope="col">Evidence still needed</th></tr></thead>${renderBookPriorityRows(record)}</table>`,
    field('The strongest challenge to our choice', a.challenge, 'challenge-record'),
    field('The recurring effort and cost to account for', a.costs, 'cost-record')];
}

function renderTest(record, a) {
  return [
    `<div class="test-plan" data-book-visual="test-plan"><section class="test-decision"><h3>${escapeBookText(recorded(a.decision))}</h3>${answer(a.recommendation)}</section></div>`,
    ...(a.candidateId ? [field('The use case we would test', candidateTitle(record, a.candidateId), 'test-candidate')] : []),
    `<div class="test-accountability"><h3>The proposed accountable owner</h3>${answer(a.owner)}</div>`,
    `<div class="test-evidence"><h3>The evidence and permission we need</h3>${answer(a.evidence)}</div>`,
    `${connector}<div class="test-action"><h3>The next test or evidence-gathering step</h3>${answer(a.test)}</div>`,
    `<div class="test-people"><h3>What changes in people’s work</h3>${answer(a.peopleChange)}</div>`,
    `<div class="test-stop"><h3>When we would stop or revise</h3>${answer(a.stopRule)}</div>`,
  ];
}

export function renderBookVisualParts(record, phaseId) {
  const phase = phaseOf(record, phaseId);
  if (!phase || phase.status === 'draft') return [];
  const renderers = [
    () => renderGoal(phase.answers), () => renderGaps(record, phase.answers),
    () => renderJourney(record, phase.answers), () => renderCandidates(record, phase.answers),
    () => renderPriorities(record, phase.answers), () => renderTest(record, phase.answers),
  ];
  return renderers[phaseId - 1]?.() ?? [];
}

export function renderBookVisual(record, phaseId) {
  return renderBookVisualParts(record, phaseId).join('');
}
