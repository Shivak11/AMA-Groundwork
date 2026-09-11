import { currentPhase } from './workshop.mjs';

export const fieldQuestions = {
  outcome: ['What would your group like to improve?', 'Name the problem and who experiences it. Begin with the work, not an AI tool.'],
  kpi: ['How would you know it has improved?', 'Choose a business goal or KPI with a clear start and end.'],
  baseline: ['What do you know about that measure today?', 'Give a figure and its source, or say Unknown. Do not invent a baseline.'],
  guardrail: ['What must not get worse?', 'Name the quality, safety, fairness or service condition to protect.'],
  hypothesis: ['What change do you think could help?', 'Connect the expected change to your goal. Treat it as an expectation to test.'],
  blockers: ['What information or decision is holding up the work?', 'Discuss one case, who holds the information or authority, what blocks action and what could resolve it.'],
  firstGap: ['Which information or decision gap should you resolve first?', 'Use the gaps already recorded; choose a practical first step.'],
  workflows: ['Which workflows could affect your outcome?', 'Name up to three actual workflows before selecting one.'],
  chosenWorkflow: ['Which workflow will you examine?', 'Choose from the workflows your group recorded.'],
  recentCase: ['What happened in a recent difficult case?', 'Reconstruct an actual case without personal records or confidential details.'],
  tasks: ['Who did what in that case?', 'Record two to six steps with stable IDs, who acted and where work waited or returned.'],
  zeroSecond: ['If the slowest task took no time, what would still prevent your outcome?', 'Consider approvals, waiting and rework elsewhere.'],
  redesign: ['What should change in the workflow itself?', 'Say what should be removed, kept or rearranged.'],
  candidates: ['Which recorded task could AI help with?', 'Start with the group’s idea. For each candidate record the task link, AI work, human check, value, non-AI alternative and assumption.'],
  choices: ['Which use case should you pursue first?', 'For each recorded candidate choose First, Later or Do not pursue, with a reason and missing evidence. Choosing none first is valid.'],
  challenge: ['What is the strongest reason against your chosen priority?', 'Invite a different group member to challenge the choice.'],
  costs: ['What would it take to run and check this regularly?', 'Include checking time, information access, recurring cost and maintenance.'],
  decision: ['What should your group do next?', 'Choose a bounded test or decide not to pilot yet.'],
  candidateId: ['Which recorded use case will the test examine?', 'Choose a candidate already prioritised First, or revisit that priority.'],
  owner: ['Who could be accountable for the next step?', 'Name a proposed role. Their agreement and capacity still need to be checked.'],
  evidence: ['What evidence do you need before proceeding?', 'Separate what you know from what still needs checking.'],
  test: ['What small test or evidence check would you run?', 'Specify the scope, comparison and human checks. Use authorised information only.'],
  stopRule: ['What result would make you stop or change course?', 'Choose an observable condition, including unacceptable risks.'],
  peopleChange: ['What would change for the people doing this work?', 'Name responsibilities, checking, training and approvals.'],
  recommendation: ['What will your group recommend?', 'Connect the next step to the recorded outcome, evidence and limits.'],
};
const fieldOrder = [
  ['outcome','kpi','baseline','guardrail','hypothesis'], ['blockers','firstGap'],
  ['workflows','chosenWorkflow','recentCase','tasks','zeroSecond','redesign'],
  ['candidates'], ['choices','challenge','costs'],
  ['decision','candidateId','owner','evidence','test','stopRule','peopleChange','recommendation'],
];
const recorded = value => value === null || (typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : value !== undefined);
export function nextConversationQuestion(record) {
  const id = currentPhase(record);
  if (!id) return {kind:'complete',field:null,question:null,hint:'All six steps are approved. Offer the workbook and backup.',choices:[]};
  const a=record.phases[id-1].answers;
  const pending = id===5 && Object.keys(record.interaction?.priorities??{}).length;
  const reconsidered = id===4 && Object.values(record.interaction?.candidateDispositions??{}).includes('Reconsider');
  let field = pending ? 'choices' : reconsidered ? 'candidates' : fieldOrder[id-1].find(key => {
    if(id===6 && key==='candidateId') {
      if(a.decision==='Do not pilot yet') return false;
      // A null candidate is valid only for no pilot. Switching back to a test
      // requires the group to select the candidate before approval.
      return !a.candidateId;
    }
    return !recorded(a[key]);
  });
  if (!field) return {kind:'approval',field:null,question:`Does your group approve the saved Step ${id} summary?`,hint:'Show the complete summary first. An answer or option selection is not approval.',choices:[{label:'Approve this step',value:'Approve'},{label:'We want to correct something',value:'Correct'}]};
  let [question,hint]=fieldQuestions[field];
  let choices=[];
  if (field==='chosenWorkflow') choices=(a.workflows??[]).map(value=>({label:value,value}));
  if (field==='decision') choices=['Test a use case','Do not pilot yet'].map(value=>({label:value,value}));
  if (field==='candidateId') {
    if(a.decision==='Do not pilot yet') {question='Shall we record that no pilot candidate is selected?';hint='Save candidateId as null; do not select a candidate for a no-pilot decision.';choices=[{label:'No pilot candidate',value:null}];}
    else choices=(record.phases[3].answers.candidates??[]).filter(c=>(record.phases[4].answers.choices??[]).some(p=>p.candidateId===c.id&&p.decision==='First')).map(c=>({label:c.title,value:c.id}));
  }
  if(field==='zeroSecond' && record.interaction?.zeroTaskId) {
    const task=a.tasks?.find(t=>t.id===record.interaction.zeroTaskId);
    if(task) question=`If “${task.work}” took no time, what would still prevent your outcome?`;
  }
  if(pending) hint='Resolve the pending priorities with their reasons and missing evidence before approval. Do not keep contradictory old reasoning.';
  if(reconsidered) hint='Resolve each candidate marked Reconsider through an agreed correction, removal or explicit Keep action before approval.';
  return {kind:'answer',field,question,hint,choices};
}
