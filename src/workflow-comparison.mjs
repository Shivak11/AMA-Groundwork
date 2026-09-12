/** Reference-only comparisons use the same saved wording in the view and PDF. */
const phase = (record, id) => record.phases.find(item => item.id === id);
const answers = (record, id) => phase(record, id)?.answers ?? {};
const sameOrder = (actual, expected) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);

export function comparisonIssues(record) {
  const comparisons = answers(record, 6).workflowComparisons ?? [];
  const tasks = answers(record, 3).tasks ?? [];
  const candidates = answers(record, 4).candidates ?? [];
  const issues = [];
  const seen = new Set();
  for (const comparison of comparisons) {
    const candidate = candidates.find(item => item.id === comparison.candidateId);
    if (!candidate || seen.has(comparison.candidateId)) {
      issues.push('Workflow comparisons must name each recorded use case at most once.');
      continue;
    }
    seen.add(comparison.candidateId);
    const currentIds = tasks.filter(task => candidate.taskIds.includes(task.id)).map(task => task.id);
    const proposedIds = (candidate.workflow ?? []).map((_, index) => index);
    const stages = comparison.stages;
    if (!proposedIds.length || !stages?.length || stages.some(stage => !stage.taskIds.length && !stage.proposedStepIndices.length)) {
      issues.push(`The workflow comparison for “${candidate.title}” needs a recorded proposed sequence and a current or proposed activity in each stage.`);
      continue;
    }
    if (!sameOrder(stages.flatMap(stage => stage.taskIds), currentIds)
      || !sameOrder(stages.flatMap(stage => stage.proposedStepIndices), proposedIds)
      || currentIds.length !== candidate.taskIds.length) {
      issues.push(`The workflow comparison for “${candidate.title}” must cover every related current task and proposed step exactly once, in recorded order.`);
    }
  }
  return issues;
}

/** @param {import('./inline-types').WorkshopRecord} record */
export function buildWorkflowComparisons(record) {
  const taskPhase = phase(record, 3), candidatePhase = phase(record, 4);
  const tasks = taskPhase?.answers.tasks ?? [];
  const candidates = candidatePhase?.status === 'draft' ? [] : candidatePhase?.answers.candidates ?? [];
  const mappings = answers(record, 6).workflowComparisons ?? [];
  const invalid = comparisonIssues(record).length > 0;
  const sourceReviewed = taskPhase?.status === 'confirmed' && candidatePhase?.status === 'confirmed';
  const priorities = answers(record, 5).choices ?? [];
  return candidates.map(candidate => {
    const linked = tasks.filter(task => candidate.taskIds.includes(task.id));
    const current = linked.map(task => ({actor:task.actor, action:task.work}));
    const proposed = candidate.workflow ?? [];
    const mapping = mappings.find(item => item.candidateId === candidate.id);
    const aligned = Boolean(mapping && !invalid && sourceReviewed);
    return {
      candidateId:candidate.id, title:candidate.title, mode:aligned ? 'aligned' : 'separate',
      review:!sourceReviewed || phase(record, 6)?.status === 'needs_review',
      current, proposed,
      stages:aligned ? mapping.stages.map(stage => ({
        current:stage.taskIds.map(taskId => { const task = linked.find(item => item.id === taskId); return {actor:task.actor,action:task.work}; }),
        proposed:stage.proposedStepIndices.map(index => proposed[index]),
      })) : [],
      humanCheck:candidate.humanCheck, components:candidate.implementation?.components ?? [],
      output:candidate.output, priority:priorities.find(item => item.candidateId === candidate.id)?.decision,
    };
  });
}

export function readableWorkflowComparisons(record) {
  const lines=[];
  for(const comparison of buildWorkflowComparisons(record)) {
    lines.push(`Workflow for ${comparison.title}`);
    if(comparison.review)lines.push('This comparison needs review.');
    const activities=items=>items.map(item=>`${item.actor}: ${item.action}`).join(' → ');
    if(comparison.mode==='aligned')for(const [index,stage] of comparison.stages.entries()) {
      lines.push(`${index+1}. Current: ${activities(stage.current)||'Added step'}`,
        `   Proposed: ${activities(stage.proposed)||'Not included in this proposal'}`);
    } else lines.push(`Related current work: ${activities(comparison.current)||'Not recorded'}`,
      `Proposed sequence: ${activities(comparison.proposed)||'Not recorded'}`);
    lines.push(`Human check: ${comparison.humanCheck}`);
  }
  return lines.join('\n');
}
