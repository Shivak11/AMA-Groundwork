import { buildWorkflowComparisons } from './workflow-comparison.mjs';

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

export function renderBookOverview(record) {
  const diagnosisPhase = phaseOf(record, 3);
  const diagnosis = answersOf(record, 3).underlyingProblem;
  const candidatePhase = phaseOf(record, 4);
  const candidates = answersOf(record, 4).candidates ?? [];
  const diagnosisLabel = diagnosisPhase?.status === 'confirmed' && diagnosis ? 'The underlying problem confirmed by the group' : 'The underlying problem';
  const diagnosisState = diagnosis && diagnosisPhase.status === 'needs_review' ? '<p class="review-note">This diagnosis needs review because an earlier answer changed.</p>' : '';
  const items = candidates.map(candidate => `<section class="overview-use-case"><h3>${escapeBookText(candidate.title)} <span class="case-reference">(${escapeBookText(candidate.id)})</span></h3>${answer(candidate.aiWork)}</section>`);
  const blocks = [
    field('The original problem', record.group.problem, 'overview-original'),
    `${field(diagnosisLabel, diagnosis || 'Not recorded in this workbook.', 'overview-diagnosis')}${diagnosisState}`,
    `<section class="overview-candidates"><h3>The identified use cases and how AI could help</h3>${candidatePhase?.status === 'needs_review' ? '<p class="review-note">These use cases need review because an earlier answer changed.</p>' : ''}${items.length ? items[0] : '<p>No group-confirmed use cases are recorded in this workbook yet.</p>'}</section>`,
    ...items.slice(1),
  ];
  return `<article class="chapter workbook-overview${bookHasLongAnswer([record.group.problem, diagnosis, candidates]) ? ' long-content' : ''}" id="workbook-overview" aria-labelledby="overview-title"><table class="chapter-layout" role="presentation"><thead><tr class="chapter-title-row"><td><h2 class="chapter-header" id="overview-title">Our problem and use cases</h2></td></tr></thead><tbody>${blocks.map(block => `<tr class="chapter-block"><td>${block}</td></tr>`).join('')}</tbody></table><footer class="chapter-footer"><span>Prepared by Dr. Shiva Kakkar</span><a href="${bookProfileUrl}">Click here to access the author’s profile</a></footer></article>`;
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
    `<section class="zero-comparison" data-book-visual="zero-second"><h3>The zero-second test</h3>${selectedTask ? `<div class="zero-selected"><h4>The task the group selected</h4>${answer(selectedTask.work)}</div>` : selected ? `<p class="review-note">The selected task ${escapeBookText(selected)} is no longer in this work map. Review the selection.</p>` : ''}<div class="zero-remaining"><h4>What would remain if the work took zero seconds</h4>${answer(a.zeroSecond)}</div><div class="zero-redesign"><h4>What the workflow may need instead</h4>${answer(a.redesign)}</div></section>`,
    ...(a.underlyingProblem ? [field(phaseOf(record, 3).status === 'confirmed' ? 'The underlying problem confirmed by the group' : 'The underlying problem to review', a.underlyingProblem, 'underlying-problem')] : []),
  ];
}

const flowArrow = '<svg class="flow-arrow" viewBox="0 0 20 28" aria-hidden="true" focusable="false"><path d="M10 2v22M4 18l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderFlow(steps, label, mode) {
  return `<figure class="use-case-flow" data-book-visual="use-case-workflow" data-flow="${mode}" aria-label="${escapeBookText(label)}"><figcaption>${escapeBookText(label)}</figcaption><ol>${steps.map((step, index) => `<li><div class="flow-node${step.actor === 'AI' ? ' flow-ai' : step.actor === 'Person' ? ' flow-person' : ''}"><span class="flow-order" aria-hidden="true">${index + 1}</span><div><h4>${escapeBookText(step.actor)}${step.reference ? ` <span class="case-reference">(${escapeBookText(step.reference)})</span>` : ''}</h4>${answer(step.action)}</div></div>${index < steps.length - 1 ? flowArrow : ''}</li>`).join('')}</ol></figure>`;
}

const componentExplanations = {
  Skill: 'Reusable instructions and an output format for a repeated task.',
  Connector: 'A permitted connection for reading or passing information between tools.',
  RAG: 'Retrieval-augmented generation: find relevant guidance and provide it to the AI before it answers.',
  Workflow: 'An agreed sequence of steps with defined inputs, outputs and responsibilities.',
  Agent: 'AI that chooses its next action within agreed instructions, tools and permissions.',
  'Human review': 'A person checks the output and retains the decisions assigned to them.',
  Other: 'A proposed component described by the group.',
};

function implementationParts(candidate, explained) {
  const proposal = candidate.implementation;
  if (!proposal) return [`<section class="implementation-proposal"><h3>Proposed implementation for ${escapeBookText(candidate.title)}</h3><p>No implementation proposal is recorded in this workbook.</p></section>`];
  const parts = (proposal.components ?? []).map(component => {
    const definition = explained.has(component.kind) ? '' : `<p class="component-definition">${escapeBookText(componentExplanations[component.kind] ?? componentExplanations.Other)}</p>`;
    explained.add(component.kind);
    return `<section class="implementation-component"><h4>${escapeBookText(component.kind)} <span class="component-status">${escapeBookText(component.status)}</span></h4>${definition}${field('What it would do', component.purpose)}${field('Why the requirement calls for it', component.basis)}</section>`;
  });
  return [
    `<section class="implementation-proposal" data-book-visual="implementation-proposal"><h3>Proposed implementation for ${escapeBookText(candidate.title)}</h3><p class="proposal-boundary">This is a proposed approach, not a verified or deployed integration.</p>${answer(proposal.approach)}${parts[0] ?? ''}</section>`,
    ...parts.slice(1),
    field('What still needs checking before implementation', proposal.checks, 'implementation-checks'),
  ];
}

function renderCandidates(record, a) {
  const tasks = answersOf(record, 3).tasks ?? [];
  const dispositions = record.interaction?.candidateDispositions ?? {};
  const explained = new Set();
  return (a.candidates ?? []).flatMap((candidate, candidateIndex) => {
    const attached = tasks.filter(task => (candidate.taskIds ?? []).includes(task.id)).map(task => ({actor: task.actor, action: task.work, reference: task.id}));
    const missing = (candidate.taskIds ?? []).filter(id => !tasks.some(task => task.id === id));
    const requirementFields = [['What it reads', 'inputs'], ['What someone receives', 'output'], ['When it runs', 'trigger'], ['Company guidance it consults', 'knowledge'], ['Repeated instructions and output format', 'format'], ['Who may access or share it', 'access']];
    const long = bookHasLongAnswer(candidate) || (candidate.taskIds ?? []).some(id => bookHasLongAnswer(tasks.find(task => task.id === id)));
    const result = [`<div class="candidate-atlas${candidateIndex ? ' candidate-atlas-continuation' : ''}" data-book-visual="candidate-work-map"><section class="candidate-map${long ? ' long-candidate' : ''}"><h3 class="candidate-title answer">${escapeBookText(candidate.title)} <span class="case-reference">(${escapeBookText(candidate.id)})</span></h3>${dispositions[candidate.id] ? `<p class="recorded-choice">Group choice: ${escapeBookText(dispositions[candidate.id])}</p>` : ''}
      <div class="candidate-route candidate-purpose"><div class="candidate-ai"><h4>What AI would do</h4>${answer(candidate.aiWork)}</div><div class="candidate-human"><h4>What a person must check or decide</h4>${answer(candidate.humanCheck)}</div></div>
      <div class="candidate-comparator"><h4>What we could do without AI</h4>${answer(candidate.nonAiAlternative)}</div>
      <div class="candidate-case"><div><h4>How this could improve the outcome</h4>${answer(candidate.value)}</div><div><h4>What we are assuming</h4>${answer(candidate.assumption)}</div></div>
    </section></div>`,
    `<section class="candidate-workflows"><h3>Workflow for ${escapeBookText(candidate.title)}</h3>${field('The named current workflow', answersOf(record, 3).chosenWorkflow)}${missing.length ? `<p class="review-note">The current work map has no confirmed link for ${missing.map(escapeBookText).join(', ')}. These task links need review.</p>` : ''}${attached.length ? renderFlow(attached, 'Related tasks in their recorded order', 'current') : '<p>No confirmed task sequence is linked to this use case.</p>'}</section>`,
    `<section class="candidate-proposed-workflow"><h3>Proposed sequence for ${escapeBookText(candidate.title)}</h3>${candidate.workflow?.length ? renderFlow(candidate.workflow, 'The proposed sequence', 'proposed') : '<p>No proposed sequence is recorded in this workbook.</p>'}</section>`,
    `<section class="candidate-requirements"><h3>Requirements for ${escapeBookText(candidate.title)}</h3><p class="requirements-boundary">These are the group’s recorded requirements. An explicit unknown remains unresolved.</p><dl>${requirementFields.map(([label, key]) => `<div><dt>${label}</dt><dd>${answer(candidate[key])}</dd></div>`).join('')}</dl>${field('The group’s success measure', answersOf(record, 1).kpi)}</section>`,
    ...implementationParts(candidate, explained)];
    return result;
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

const comparisonArrow = '<span class="book-comparison-arrow" aria-hidden="true"><svg viewBox="0 0 24 28" focusable="false"><path d="M12 3v21M6 18l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

function comparisonActivities(activities, side, continueAfter = false) {
  return `<ol class="book-comparison-activities">${activities.map((activity, index) => `<li><div class="book-comparison-activity${side === 'proposed' && activity.actor === 'AI' ? ' book-comparison-ai' : ''}"><h4>${escapeBookText(activity.actor)}</h4>${answer(activity.action)}</div>${index < activities.length - 1 || continueAfter ? comparisonArrow : ''}</li>`).join('')}</ol>`;
}

function comparisonPair(stage, title, index, nextStages) {
  const current = stage.current.length ? comparisonActivities(stage.current, 'current', nextStages.some(next => next.current.length)) : '<p class="book-comparison-empty">This is an added step in the proposal.</p>';
  const proposed = stage.proposed.length ? comparisonActivities(stage.proposed, 'proposed', nextStages.some(next => next.proposed.length)) : '<p class="book-comparison-empty">This current step is not included in the proposal.</p>';
  return `<table class="book-comparison-pair${bookHasLongAnswer(stage) ? ' book-comparison-long' : ''}" aria-label="${escapeBookText(`${title}: comparison stage ${index + 1}`)}"><thead><tr><th scope="col">Current work</th><th scope="col">Proposed work</th></tr></thead><tbody><tr><td data-label="Current work">${current}</td><td data-label="Proposed work">${proposed}</td></tr></tbody></table>`;
}

export function renderBookWorkflowComparisons(record) {
  const priorityNeedsReview = phaseOf(record, 5)?.status === 'needs_review';
  return buildWorkflowComparisons(record).flatMap(comparison => {
    const wrapper = (content, extra = '') => `<section class="book-workflow-comparison ${extra}" data-book-visual="workflow-comparison" data-comparison-mode="${comparison.mode}" data-candidate="${escapeBookText(comparison.candidateId)}">${content}</section>`;
    const heading = `<h3 class="book-comparison-title">${escapeBookText(comparison.title)} <span class="case-reference">(${escapeBookText(comparison.candidateId)})</span></h3><p class="book-comparison-scope">This comparison covers the current tasks linked to this use case.</p><p class="book-comparison-priority">${comparison.priority ? `Recorded priority: ${escapeBookText(comparison.priority)}.${priorityNeedsReview ? ' This priority needs review.' : ''}` : 'No priority is confirmed in this workbook.'}</p>${comparison.review ? '<p class="review-note">This comparison needs review alongside the recorded work and recommendation.</p>' : ''}`;
    let steps;
    if (comparison.mode === 'aligned') {
      steps = comparison.stages.map((stage, index) => wrapper(`${index === 0 ? heading : ''}${comparisonPair(stage, comparison.title, index, comparison.stages.slice(index + 1))}`, index === 0 ? 'book-comparison-start' : ''));
    } else {
      const sequence = (activities, side) => activities.length ? activities.map((activity, index) => `<div class="book-comparison-sequence" data-sequence="${side}"><h4>${side === 'current' ? 'Current work' : 'Proposed work'} · Step ${index + 1}</h4>${comparisonActivities([activity], side, index < activities.length - 1)}</div>`) : [`<div class="book-comparison-sequence" data-sequence="${side}"><h4>${side === 'current' ? 'Current work' : 'Proposed work'}</h4><p>${side === 'current' ? 'No related current task is recorded in this workbook.' : 'No proposed sequence is recorded in this workbook.'}</p></div>`];
      const sequences = [...sequence(comparison.current, 'current'), ...sequence(comparison.proposed, 'proposed')];
      steps = sequences.map((content, index) => wrapper(`${index === 0 ? `${heading}<p class="book-comparison-unmapped">The sequences are shown separately because no exact stage mapping is confirmed.</p>` : ''}${content}`, index === 0 ? 'book-comparison-start' : ''));
    }
    const check = wrapper(`<div class="book-comparison-human"><h4>What a person must check or decide</h4>${answer(comparison.humanCheck)}</div>${comparison.output ? field('What someone receives', comparison.output, 'book-comparison-output') : ''}`);
    const components = comparison.components.map((component, index) => wrapper(`${index === 0 ? `<h4 class="book-comparison-components-title">Proposed components for ${escapeBookText(comparison.title)}</h4>` : ''}<section class="book-comparison-component"><h4>${escapeBookText(component.kind)} <span class="component-status">${escapeBookText(component.status)}</span></h4>${answer(component.purpose)}</section>`));
    return [...steps, check, ...components];
  });
}

function renderTest(record, a) {
  const candidates = answersOf(record, 4).candidates ?? [];
  return [
    `<div class="test-plan" data-book-visual="test-plan"><section class="test-decision"><h3>${escapeBookText(a.decision || 'The group’s recommendation')}</h3>${answer(a.recommendation)}</section></div>`,
    ...(a.candidateId && a.decision !== 'Do not pilot yet' ? [field('The use case we would test', candidateTitle(record, a.candidateId), 'test-candidate')] : []),
    ...(a.owner ? [`<div class="test-accountability"><h3>The proposed accountable owner</h3>${answer(a.owner)}</div>`] : []),
    ...(a.evidence ? [`<div class="test-evidence"><h3>The evidence and permission we need</h3>${answer(a.evidence)}</div>`] : []),
    ...(a.test ? [`${connector}<div class="test-action"><h3>The next test or evidence-gathering step</h3>${answer(a.test)}</div>`] : []),
    ...(a.peopleChange ? [`<div class="test-people"><h3>What changes in people’s work</h3>${answer(a.peopleChange)}</div>`] : []),
    ...(a.stopRule ? [`<div class="test-stop"><h3>When we would stop or revise</h3>${answer(a.stopRule)}</div>`] : []),
    `<section class="final-use-cases"><h3>All identified use cases</h3>${candidates.length ? '<p>The comparisons retain every identified use case, including those deferred or not pursued.</p>' : '<p>No group-confirmed use cases are recorded in this workbook.</p>'}</section>`,
    ...renderBookWorkflowComparisons(record),
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
