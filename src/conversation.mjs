import { currentPhase, phaseReadiness } from './workshop.mjs';

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
  tasks: ['Who did what in that case?', 'Describe two to six steps with who acted and where work waited or returned. Keep IDs internal and use task names in questions.'],
  zeroSecond: ['If the slowest task took no time, what would still prevent your outcome?', 'Consider approvals, waiting and rework elsewhere.'],
  redesign: ['What should change in the workflow itself?', 'Say what should be removed, kept or rearranged.'],
  underlyingProblem: ['From this example, what is actually causing the problem?', 'Propose a short explanation grounded in the case and ask the group to correct it. Do not treat your interpretation as confirmed until the group approves this step.'],
  candidates: ['Which recorded task could AI help with?', 'Start with the group’s idea. For each candidate record the task link, AI work, human check, value, non-AI alternative and assumption.'],
  choices: ['Which use case would be most useful to your group?', 'Name each use case in full and give a short reminder of what it does. Discuss one decision at a time. Record First, Later or Do not pursue, with the reason and what needs checking. Choosing none first is valid. Never use code-only options or Both first.'],
  challenge: ['What is the strongest reason against your chosen priority?', 'Invite a different group member to challenge the choice.'],
  costs: ['What would it take to run and check this regularly?', 'Include checking time, information access, recurring cost and maintenance.'],
  decision: ['What should your group do next?', 'Choose a bounded test or decide not to pilot yet.'],
  candidateId: ['Which recorded use case will the test examine?', 'Choose a candidate already prioritised First, or revisit that priority.'],
  owner: ['Who could be accountable for the next step?', 'Name a proposed role. Their agreement and capacity still need to be checked.'],
  evidence: ['What evidence do you need before proceeding?', 'Separate what you know from what still needs checking.'],
  test: ['What small test or evidence check would you run?', 'Specify the scope, comparison and human checks. Use authorised information only.'],
  stopRule: ['What result would make you stop or change course?', 'Choose an observable condition, including unacceptable risks.'],
  peopleChange: ['What would change for the people doing this work?', 'Name responsibilities, checking, training and approvals.'],
  recommendation: ['What should the workbook say about your group’s recommendation?', 'Draft this from the agreed priorities, named AI use cases and what remains uncertain. Ask only for missing decisions. No extra pilot question and no offer to build anything.'],
  workflowComparisons: ['Does the comparison show the work correctly?', 'Repair the comparison from the saved task and proposed-workflow sequences. Keep identifiers and step indices internal. Do not ask the group to repair tool data; if the correspondence is uncertain, save an empty comparison list and retain the separate recorded sequences.'],
};
const groundingQuestions={
  inputs:['What information would AI use for this?', 'Name where the information currently comes from; do not assume it can be accessed.'],
  output:['What should someone receive from AI, and what would they do with it?', 'Describe a concrete output and the action or decision it supports.'],
  trigger:['When should this happen?', 'For example, when someone asks, at an agreed time, or after an event. Establish this without asking the group to choose an agent or architecture.'],
  knowledge:['Would AI need to refer to any company documents or past examples?', 'Record which sources, who owns them and whether they are up to date. None or not yet known is valid.'],
  format:['Are there instructions or a format it should follow every time?', 'Use an existing template or example if available. Do not demand one where unnecessary.'],
  access:['Who is allowed to see this information, and who checks the result?', 'Separate available information from permission to read it, send it or change it. Never assume permission or a working integration.'],
  implementation:['Does this proposed approach fit how your team works?', 'Infer the smallest technical approach from recorded answers. Explain it in everyday language here. Document skill, connector/MCP, RAG, workflow or agent components only if justified, with answer-based reasons and unresolved checks. Do not ask participants to select architecture.'],
  workflow:['Does this show the steps in the right order?', 'Draft the proposed person/system/AI sequence from recorded answers and show it visually for correction. Reuse the existing human check; do not invent actions or automatic sends.'],
};
const fieldOrder = [
  ['outcome','kpi','baseline','guardrail','hypothesis'], ['blockers','firstGap'],
  ['workflows','chosenWorkflow','recentCase','tasks','zeroSecond','redesign','underlyingProblem'],
  ['candidates'], ['choices','challenge','costs'],
  ['decision','candidateId','owner','evidence','test','stopRule','peopleChange','recommendation'],
];
const recorded = value => value === null || (typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : value !== undefined);
export function nextConversationQuestion(record) {
  const id = currentPhase(record);
  if (!id) return {kind:'complete',field:null,question:null,hint:'All six steps are approved. Briefly recap the named AI use cases and the group recommendation. Open the completed workbook inline with Download PDF prominent. Say they can keep it for reflection and return when they decide to implement. Do not ask another question, offer a build or mention private keys, revisions, backups or storage.',choices:[]};
  const a=record.phases[id-1].answers;
  const pending = id===5 && Object.keys(record.interaction?.priorities??{}).length;
  const reconsidered = id===4 && Object.values(record.interaction?.candidateDispositions??{}).includes('Reconsider');
  const order=record.experienceVersion===2&&id===6 ? ['recommendation'] : fieldOrder[id-1];
  let field = pending ? 'choices' : reconsidered ? 'candidates' : order.find(key => {
    if(key==='underlyingProblem'&&record.experienceVersion!==2) return false;
    if(id===6 && key==='candidateId') {
      if(a.decision==='Do not pilot yet') return false;
      // A null candidate is valid only for no pilot. Switching back to a test
      // requires the group to select the candidate before approval.
      return !a.candidateId;
    }
    return !recorded(a[key]);
  });
  const readiness = phaseReadiness(record,id);
  if (!field && !readiness.complete) field=readiness.issues.find(issue => fieldQuestions[issue.field])?.field ?? readiness.missingFields[0];
  if (!field) return {kind:'approval',field:null,question:`Does your group approve the saved Step ${id} summary?`,hint:`Show the complete summary first. An answer or option selection is not approval.${id===6?' Before this existing approval, prepare the visual comparison using saved work. For each use case whose correspondence is clear, save optional workflowComparisons with candidateId and stages of taskIds plus zero-based proposedStepIndices. Cover every linked current task and proposed step exactly once in their recorded order. Either side may be empty for an added or omitted activity, never both. Do not align by array position or merge different use cases. If uncertain, omit that mapping and keep the separate sequences. Show the comparison for correction as part of the recap, without another questionnaire.':''}`,choices:[{label:'Approve this step',value:'Approve'},{label:'We want to correct something',value:'Correct'}]};
  let [question,hint]=fieldQuestions[field];
  let choices=[];
  const grounding=readiness.issues.find(issue=>issue.field==='candidates'&&issue.detail);
  if(field==='candidates'&&grounding&&!reconsidered) {
    const candidate=a.candidates?.find(c=>c.id===grounding.candidateId);
    if(candidate&&groundingQuestions[grounding.detail]) {
      [question,hint]=groundingQuestions[grounding.detail];
      question=`For “${candidate.title}”: ${question}`;
      hint=`${hint} Reuse answers already supplied. Save the complete candidates array, updating ${candidate.id}; do not expose internal field names.`;
    }
  }
  if (field==='chosenWorkflow') choices=(a.workflows??[]).map(value=>({label:value,value}));
  if (field==='decision') choices=['Test a use case','Do not pilot yet'].map(value=>({label:value,value}));
  if (field==='candidateId') {
    if(a.decision==='Do not pilot yet') {question='Shall we record that no pilot candidate is selected?';hint='Save candidateId as null; do not select a candidate for a no-pilot decision.';choices=[{label:'No pilot candidate',value:null}];}
    else choices=(record.phases[3].answers.candidates??[]).filter(c=>(record.phases[4].answers.choices??[]).some(p=>p.candidateId===c.id&&p.decision==='First')).map(c=>({label:`${c.title} · ${c.id.toUpperCase()}`,value:c.id}));
  }
  if(field==='zeroSecond' && record.interaction?.zeroTaskId) {
    const task=a.tasks?.find(t=>t.id===record.interaction.zeroTaskId);
    if(task) question=`If “${task.work}” took no time, what would still prevent your outcome?`;
  }
  if(pending) hint='Resolve the pending priorities with their reasons and missing evidence before approval. Do not keep contradictory old reasoning.';
  if(reconsidered) hint='Resolve each candidate marked Reconsider through an agreed correction, removal or explicit Keep action before approval.';
  const issue = readiness.issues.find(issue => issue.field === field && !readiness.missingFields.includes(field));
  if (issue) hint=`${hint} ${issue.message} Reuse the group's supplied answer when it already resolves this; do not ask them to repair tool arguments.`;
  return {kind:'answer',field,question,hint,choices};
}
