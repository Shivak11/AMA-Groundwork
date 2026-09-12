import { z } from 'zod';
import { comparisonIssues, readableWorkflowComparisons } from './workflow-comparison.mjs';

const text = z.string().trim().min(1).max(1200);
const short = z.string().trim().min(1).max(120);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const obj = shape => z.object(shape).strict();
export const barrierCategorySchema = z.enum(['Missing information', 'Access', 'Authority', 'Incentives', 'Trust', 'Other']);
export const prioritySchema = z.enum(['First', 'Later', 'Do not pursue']);
const boundedSelections = value => z.preprocess((map,ctx) => {
  if (map && typeof map === 'object' && Object.hasOwn(map,'__proto__')) ctx.addIssue({code:'custom',message:'Rename the reserved candidate ID before recording a visual selection.'});
  return map;
},z.record(id, value).refine(map => Object.keys(map).length <= 5, 'Keep at most five candidate selections.'));
export const interactionSelectionsSchema = obj({
  barrierCategories: z.record(z.string().regex(/^[0-4]$/), barrierCategorySchema).default({}),
  zeroTaskId: id.optional(),
  candidateDispositions: boundedSelections(z.enum(['Keep', 'Reconsider'])).default({}),
  priorities: boundedSelections(prioritySchema).default({}),
});
const phaseStateSchema = obj({ id: z.number().int().min(1).max(6), status: z.enum(['draft','confirmed','needs_review']),
  approvalNote: text.optional(), approvedAt: z.iso.datetime().optional() });
export const interactionSchema = interactionSelectionsSchema.extend({
  undo: obj({ phaseId: z.number().int().min(1).max(6), label: short,
    answers: z.record(z.string(), z.unknown()), states: z.array(phaseStateSchema).length(6), selections: interactionSelectionsSchema }).optional(),
});
export const groupSchema = obj({
  name: short, members: z.array(short).min(1).max(12), problem: z.string().trim().min(1).max(400),
  context: z.string().trim().max(400).default(''), date: z.iso.date(),
});
export const groupInputSchema = groupSchema.extend({date:z.iso.date().optional()});
export function datedGroup(group, now = new Date()) {
  return groupSchema.parse({...group,date:group.date ?? now.toISOString().slice(0,10)});
}
const implementationSchema = obj({approach:text,components:z.array(obj({
  kind:z.enum(['Skill','Connector','RAG','Workflow','Agent','Human review','Other']),
  purpose:text,basis:text,status:z.enum(['Proposed','Needs confirmation']),
})).min(1).max(6),checks:text});
export const candidateSchema = obj({id,title:short,taskIds:z.array(id).max(6),aiWork:text,value:text,
  humanCheck:text,nonAiAlternative:text,assumption:text,
  inputs:text.optional(),output:text.optional(),trigger:text.optional(),knowledge:text.optional(),
  format:text.optional(),access:text.optional(),implementation:implementationSchema.optional(),
  workflow:z.array(obj({actor:z.enum(['Person','AI','System']),action:text})).min(2).max(8).optional(),
});
export const workflowComparisonSchema = obj({candidateId:id,stages:z.array(obj({
  taskIds:z.array(id).max(6), proposedStepIndices:z.array(z.number().int().min(0).max(7)).max(8),
})).min(1).max(14)});
export const answerSchemas = [
  obj({ outcome: text, kpi: text, baseline: text, guardrail: text, hypothesis: text }),
  obj({ blockers: z.array(obj({ information: text, holder: text, barrier: text, unlock: text })).min(1).max(5), firstGap: text }),
  obj({ workflows: z.array(text).min(1).max(3), chosenWorkflow: text, recentCase: text,
    tasks: z.array(obj({ id, actor: text, work: text, friction: text })).min(2).max(6), zeroSecond: text, redesign: text, underlyingProblem:text.optional() }),
  obj({ candidates: z.array(candidateSchema).min(1).max(5) }),
  obj({ choices: z.array(obj({ candidateId: id, decision: z.enum(['First', 'Later', 'Do not pursue']), reason: text, evidenceGap: text })).min(1).max(5), challenge: text, costs: text }),
  obj({ decision: z.enum(['Test a use case', 'Do not pilot yet']), candidateId: id.nullable(), owner: text,
    evidence: text, peopleChange: text, test: text, stopRule: text, recommendation: text,
    workflowComparisons:z.array(workflowComparisonSchema).max(5).optional() }),
];
export function phaseAnswerSchema(record, phaseId) {
  const schema=answerSchemas[phaseId-1];
  if(record.experienceVersion!==2) return schema;
  if(phaseId===3) return schema.required({underlyingProblem:true});
  if(phaseId===4) return schema.extend({candidates:z.array(candidateSchema.required({inputs:true,output:true,trigger:true,knowledge:true,format:true,access:true,implementation:true,workflow:true})).min(1).max(5)});
  return phaseId===6 ? schema.partial().required({recommendation:true}) : schema;
}
export function groundingIssues(record, phaseId) {
  if(record.experienceVersion!==2) return [];
  const answers=record.phases[phaseId-1].answers,issues=[];
  if(phaseId===3&&!answers.underlyingProblem) issues.push({field:'underlyingProblem',message:'Confirm the underlying problem with the group before approving this step.'});
  if(phaseId===4) for(const candidate of answers.candidates??[]) {
    for(const key of ['inputs','output','trigger','knowledge','format','access','implementation','workflow']) {
      if(candidate[key]===undefined) issues.push({field:'candidates',candidateId:candidate.id,detail:key,message:`For ${candidate.title}, record ${key} from the discussion or an explicitly acknowledged unknown before approval.`});
    }
  }
  return issues;
}
const phaseSchema = obj({ id: z.number().int().min(1).max(6), status: z.enum(['draft','confirmed','needs_review']),
  answers: z.record(z.string(), z.unknown()), approvalNote: text.optional(), approvedAt: z.iso.datetime().optional() });
export const recordSchema = obj({ schemaVersion: z.literal(1), experienceVersion:z.literal(2).optional(), group: groupSchema, revision: z.number().int().min(0),
  phases: z.array(phaseSchema).length(6), interaction: interactionSchema.optional() }).superRefine((record, ctx) => {
  record.phases.forEach((phase, i) => {
    if (phase.id !== i + 1) ctx.addIssue({ code: 'custom', path:['phases',i,'id'], message:'Phases must be ordered 1 to 6.' });
    const completeSchema=phaseAnswerSchema(record,i+1);
    const schema = phase.status === 'draft' ? answerSchemas[i].partial() : completeSchema;
    const checked = schema.safeParse(phase.answers);
    if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue({ ...issue, path:['phases',i,'answers',...issue.path] });
    if (phase.status === 'confirmed' && (!phase.approvalNote || !phase.approvedAt)) ctx.addIssue({ code:'custom', path:['phases',i], message:'A confirmed phase needs the group approval and timestamp.' });
    if (phase.status === 'confirmed' && record.phases.slice(0,i).some(p => p.status !== 'confirmed')) ctx.addIssue({ code:'custom', path:['phases',i], message:'Later phases cannot be confirmed before earlier phases.' });
    if(phase.status==='confirmed') for(const issue of groundingIssues(record,i+1)) ctx.addIssue({code:'custom',path:['phases',i,'answers',issue.field],message:issue.message});
  });
  const undo = record.interaction?.undo;
  if (undo) {
    undo.states.forEach((state, i) => {
      if (state.id !== i + 1) ctx.addIssue({code:'custom',path:['interaction','undo','states',i,'id'],message:'Undo phases must be ordered 1 to 6.'});
      if (state.status === 'confirmed' && (!state.approvalNote || !state.approvedAt || undo.states.slice(0,i).some(p=>p.status!=='confirmed'))) {
        ctx.addIssue({code:'custom',path:['interaction','undo','states',i],message:'Undo must retain valid ordered approvals.'});
      }
    });
    const completeSchema=phaseAnswerSchema(record,undo.phaseId);
    const schema = undo.states[undo.phaseId-1].status === 'draft' ? answerSchemas[undo.phaseId-1].partial() : completeSchema;
    const checked = schema.safeParse(undo.answers);
    if (!checked.success) for (const issue of checked.error.issues) ctx.addIssue({...issue,path:['interaction','undo','answers',...issue.path]});
  }
});

export const phases = [
  { id:1, title:'What should improve?', format:'Complete the outcome statement', question:'Complete this together: We want ___ to improve for ___, without making ___ worse.', instructions:'Ask for the recent problem behind the sentence. Name one useful measure, a baseline or Unknown, and the change the group expects. Let the group answer before suggesting wording.' },
  { id:2, title:'What prevents progress?', format:'Sort the barriers', question:'Which information or decision is missing, inaccessible, disputed or waiting for someone with authority?', instructions:'Use the current problem. Ask the group to identify who holds the information and one practical unlock. Distinguish data access from incentives, trust and authority; do not assume a connector resolves them.' },
  { id:3, title:'What actually happens?', format:'Replay a difficult case', question:'Choose a recent troublesome case. What happened first, and who had to do what next?', instructions:'Consider up to three workflows before choosing one. Reconstruct 2–6 actual steps including waiting and rework. Then ask: if the slowest task took zero seconds, what would still prevent the outcome? Record whether the workflow itself should change.' },
  { id:4, title:'Where could AI help?', format:'Review the proposed use cases', question:'Where could AI help with this work, and what should a person still check?', instructions:'Ask for the group idea first. Name each use case clearly and link it to the recorded tasks. Reuse known answers and ask only for missing information: inputs, useful output, when it runs, reference material, repeatable rules, access and human checks. Explain these as everyday work questions. Propose the smallest justified technical approach in the workbook, explaining any skill, connector/MCP, RAG, workflow or agent in plain language. Tie each component to a specific answer, mark unverified access and capability as needing confirmation, and never invent an integration. Show the proposed workflow and get the group to correct it. Keep a non-AI alternative and assumptions for every case.' },
  { id:5, title:'Which use cases are worth pursuing?', format:'Compare the use cases', question:'Which use case is most useful for your group, and what would you need to check before using it?', instructions:'Compare evidence, access, checking effort and recurring costs. Assign First, Later or Do not pursue with reasons and missing evidence. Ask one self-contained decision at a time, using full use-case names rather than IDs. Do not offer Both first. Choosing none first is legitimate; retain every identified use case and why it was deferred or rejected.' },
  { id:6, title:'Your use cases and recommendation', format:'Review the completed workbook', question:'Does this summary describe the use cases your group identified and your recommendation?', instructions:'Draft a short recap from the approved answers, naming the identified use cases and the recommendation. Reuse the priority discussion; ask only if a material recommendation is missing. Do not add a pilot questionnaire or offer to build anything. Ask the group to approve the recap. On approval, open the completed workbook with Download PDF prominent, and say they can keep it for reflection and future implementation. Choosing not to pilot must never remove identified use cases.' },
].map((phase,i) => ({ ...phase, requiredFields:Object.keys(answerSchemas[i].shape) }));

export function validateRecord(input) {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > 150000) throw new Error('This record is too large. Keep the summaries concise and remove raw transcripts.');
  const record = recordSchema.parse(input);
  for (const phase of record.phases) if (phase.status === 'confirmed') validateReferences(record, phase.id);
  validateInteractionReferences(record);
  return record;
}
export function currentPhase(record) { return record.phases.find(p => p.status !== 'confirmed')?.id ?? null; }
export function phaseGuide(record, requested) {
  const base = phases[(requested ?? currentPhase(record) ?? 6)-1];
  const schema=phaseAnswerSchema(record,base.id);
  const phase={...base,requiredFields:Object.keys(schema.shape).filter(key=>!schema.shape[key].isOptional())};
  if (phase?.id === 3 && record.interaction?.zeroTaskId && !record.phases[2].answers.zeroSecond) {
    const task = record.phases[2].answers.tasks?.find(item=>item.id===record.interaction.zeroTaskId);
    if (task) return {...phase,question:`If “${task.work}” took zero seconds, what would still prevent your outcome?`};
  }
  return phase;
}
export function createRecord(group) {
  return { schemaVersion:1, experienceVersion:2, group:datedGroup(group), revision:0,
    phases: phases.map(p => ({id:p.id, status:'draft', answers:{}})) };
}
function assertEditable(record, phaseId) {
  if (!Number.isInteger(phaseId) || phaseId < 1 || phaseId > 6) throw new Error('Choose a phase from 1 to 6.');
  const current = currentPhase(record);
  if (current && phaseId > current) throw new Error(`Complete or review phase ${current} before moving ahead.`);
}
function markChanged(record, phaseId) {
  record.revision += 1;
  record.phases.forEach(p => {
    if (p.id === phaseId) { p.status = 'draft'; delete p.approvalNote; delete p.approvedAt; }
    else if (p.id > phaseId && p.status === 'confirmed') p.status = 'needs_review';
  });
}
function reconcileInteraction(record, phaseId, patch, previousAnswers) {
  if (!record.interaction) return;
  delete record.interaction.undo;
  if (phaseId === 2 && Object.hasOwn(patch ?? {}, 'blockers')) {
    const blockerSchema = answerSchemas[1].shape.blockers.element;
    const before = (previousAnswers?.blockers ?? []).map(blocker=>JSON.stringify(blockerSchema.parse(blocker)));
    const after = record.phases[1].answers.blockers.map(blocker=>JSON.stringify(blockerSchema.parse(blocker)));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const remapped = {};
      for (const [index,category] of Object.entries(record.interaction.barrierCategories)) {
        const key = before[Number(index)];
        const matches = after.map((value,i)=>value===key ? i : -1).filter(i=>i>=0);
        if (before.filter(value=>value===key).length === 1 && matches.length === 1) remapped[matches[0]]=category;
      }
      record.interaction.barrierCategories = remapped;
    }
  }
  const tasks = new Set((record.phases[2].answers.tasks ?? []).map(task=>task.id));
  if (!tasks.has(record.interaction.zeroTaskId)) delete record.interaction.zeroTaskId;
  const candidates = new Set((record.phases[3].answers.candidates ?? []).map(candidate=>candidate.id));
  for (const key of ['candidateDispositions','priorities']) {
    for (const candidateId of Object.keys(record.interaction[key])) if (!candidates.has(candidateId)) delete record.interaction[key][candidateId];
  }
  if (phaseId === 4 && Object.hasOwn(patch ?? {}, 'candidates')) {
    const candidateSchema = answerSchemas[3].shape.candidates.element;
    for (const candidateId of Object.keys(record.interaction.candidateDispositions)) {
      if (record.interaction.candidateDispositions[candidateId] !== 'Reconsider') continue;
      const before = previousAnswers?.candidates?.find(candidate=>candidate.id===candidateId);
      const after = record.phases[3].answers.candidates.find(candidate=>candidate.id===candidateId);
      if (!before || !after || JSON.stringify(candidateSchema.parse(before)) !== JSON.stringify(candidateSchema.parse(after))) delete record.interaction.candidateDispositions[candidateId];
    }
  }
  if (phaseId === 5 && Object.hasOwn(patch ?? {}, 'choices')) {
    for (const choice of record.phases[4].answers.choices) {
      const pending = Object.hasOwn(record.interaction.priorities,choice.candidateId) ? record.interaction.priorities[choice.candidateId] : undefined;
      if (pending && pending !== choice.decision) throw new Error(`The choice for ${choice.candidateId} does not match its pending ${pending} selection. Use the latest selection, or change it explicitly in the activity before saving.`);
      if (pending === choice.decision) delete record.interaction.priorities[choice.candidateId];
    }
  }
}
export function savePhase(input, phaseId, patch, groupPatch) {
  const record = validateRecord(input);
  assertEditable(record, phaseId);
  if (!Object.keys(patch ?? {}).length && !Object.keys(groupPatch ?? {}).length) {
    throw new Error('No answer field or group correction was supplied. Nothing was saved. Use the current phase answer fields and retry with the participant’s existing answer; do not ask them for JSON keys.');
  }
  if (patch && Object.keys(patch).length) {
    const previousAnswers = record.phases[phaseId-1].answers;
    const next = answerSchemas[phaseId-1].partial().parse({...record.phases[phaseId-1].answers, ...patch});
    if (!sameValue(previousAnswers, next)) {
      record.phases[phaseId-1].answers = next;
      // These derived indices cannot survive a reordered or edited source. The
      // previous persistent revision retains the old mapping and all its text.
      if ((phaseId === 3 && !sameValue(previousAnswers.tasks,next.tasks))
        || (phaseId === 4 && !sameValue(previousAnswers.candidates,next.candidates))) {
        delete record.phases[5].answers.workflowComparisons;
      }
      markChanged(record, phaseId);
      reconcileInteraction(record, phaseId, patch, previousAnswers);
    } else if (phaseId === 5 && Object.hasOwn(patch,'choices') && Object.keys(record.interaction?.priorities ?? {}).length) {
      const previousInteraction = structuredClone(record.interaction);
      reconcileInteraction(record, phaseId, patch, previousAnswers);
      if (!sameValue(previousInteraction, record.interaction)) {
        record.revision += 1;
        delete record.interaction.undo;
      }
    }
  }
  if (groupPatch && Object.keys(groupPatch).length) {
    const nextGroup = groupSchema.parse({...record.group,...groupPatch});
    if (!sameValue(record.group, nextGroup)) {
      const changedProblem = record.group.problem !== nextGroup.problem || record.group.context !== nextGroup.context;
      record.group = nextGroup;
      // A problem change affects the whole case, whereas spelling a member's name does not.
      if (changedProblem) markChanged(record,1);
      else record.revision += 1;
      if (record.interaction) delete record.interaction.undo;
    }
  }
  return validateRecord(record);
}

export function sameValue(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && sameValue(left[key],right[key]));
}

export function phaseReadiness(record, phaseId = currentPhase(record) ?? 6) {
  const answers = record.phases[phaseId-1].answers;
  const schema = phaseAnswerSchema(record,phaseId);
  const parsed = schema.safeParse(answers);
  const missingFields = Object.keys(schema.shape).filter(key => answers[key] === undefined&&!schema.shape[key].isOptional());
  const issues = parsed.success ? [] : parsed.error.issues.map(issue => ({field:String(issue.path[0] ?? ''),message:issue.message}));
  issues.push(...groundingIssues(record,phaseId));
  try { validateReferences(record, phaseId); }
  catch (error) {
    const field = phaseId === 3 ? (/chosen workflow/i.test(error.message) ? 'chosenWorkflow' : 'tasks')
      : phaseId === 4 ? 'candidates' : phaseId === 5 ? 'choices' : /workflow comparison/i.test(error.message) ? 'workflowComparisons' : 'candidateId';
    issues.push({field,message:error.message});
  }
  if (phaseId === 4 && Object.values(record.interaction?.candidateDispositions ?? {}).includes('Reconsider')) issues.push({field:'candidates',message:'Resolve candidates marked Reconsider before approval.'});
  if (phaseId === 5 && Object.keys(record.interaction?.priorities ?? {}).length) issues.push({field:'choices',message:'Save the pending priorities with their reasons before approval.'});
  return {phaseId,complete:issues.length === 0,missingFields,issues};
}
export function reopenPhase(input, phaseId) {
  const record = validateRecord(input);
  assertEditable(record, phaseId);
  markChanged(record, phaseId);
  if (record.interaction) delete record.interaction.undo;
  return record;
}
function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}
function validateReferences(record, phaseId) {
  const a = record.phases.map(p=>p.answers);
  if (phaseId >= 3 && a[2].tasks) unique(a[2].tasks.map(t=>t.id),'Task IDs');
  if (phaseId >= 3 && a[2].chosenWorkflow && !a[2].workflows?.includes(a[2].chosenWorkflow)) throw new Error('The chosen workflow must be one of the recorded alternatives. Add or correct the alternative first.');
  if (phaseId >= 4 && a[3].candidates) {
    unique(a[3].candidates.map(c=>c.id),'Candidate IDs');
    const tasks = new Set((a[2].tasks ?? []).map(t=>t.id));
    for (const c of a[3].candidates) {
      if (c.taskIds.some(t=>!tasks.has(t))) throw new Error(`Candidate ${c.id} refers to a task that is not in the current case.`);
      unique(c.taskIds,`Task references for ${c.id}`);
    }
  }
  if (phaseId >= 5 && a[4].choices) {
    const ids = (a[3].candidates??[]).map(c=>c.id);
    unique(a[4].choices.map(c=>c.candidateId),'Prioritisation choices');
    if (a[4].choices.length !== ids.length || a[4].choices.some(c=>!ids.includes(c.candidateId))) throw new Error('Give each current candidate exactly one prioritisation decision.');
    if (a[4].choices.filter(c=>c.decision==='First').length > 1) throw new Error('Choose at most one candidate first.');
  }
  if (phaseId === 6) {
    const mappingIssues = comparisonIssues(record);
    if (mappingIssues.length) throw new Error(mappingIssues.join(' '));
    if (a[5].decision === 'Test a use case' && !a[4].choices?.some(c=>c.candidateId===a[5].candidateId && c.decision==='First')) throw new Error('The proposed test must refer to the candidate chosen First.');
    if (a[5].decision === 'Do not pilot yet' && a[5].candidateId !== null) throw new Error('A no-pilot recommendation must not name a pilot candidate ID.');
  }
}
function validateInteractionReferences(record) {
  const interaction = record.interaction;
  if (!interaction) return;
  const blockers = record.phases[1].answers.blockers ?? [];
  for (const index of Object.keys(interaction.barrierCategories)) if (Number(index) >= blockers.length) throw new Error('A barrier selection refers to a gap that is not recorded.');
  if (interaction.zeroTaskId && !(record.phases[2].answers.tasks ?? []).some(task=>task.id===interaction.zeroTaskId)) throw new Error('The zero-second selection must refer to a recorded task.');
  const ids = new Set((record.phases[3].answers.candidates ?? []).map(candidate=>candidate.id));
  for (const key of ['candidateDispositions','priorities']) {
    for (const candidateId of Object.keys(interaction[key])) if (!ids.has(candidateId)) throw new Error('A visual selection refers to a candidate that is not recorded.');
  }
  if (record.phases[3].status === 'confirmed' && Object.values(interaction.candidateDispositions).includes('Reconsider')) throw new Error('Resolve the candidates marked Reconsider before approving this phase.');
  if (record.phases[4].status === 'confirmed' && Object.keys(interaction.priorities).length) throw new Error('Save and review the pending visual priorities before approving the shortlist.');
}
export function confirmPhase(input, phaseId, confirmation, now = new Date().toISOString()) {
  const record = validateRecord(input);
  assertEditable(record, phaseId);
  if (currentPhase(record) !== phaseId) throw new Error('This phase is already confirmed. Re-export it, or save the requested correction first.');
  const approval = text.parse(confirmation);
  const normalisedApproval = approval.normalize('NFKC').replace(/[\u2018\u2019\u02bc]/g,"'");
  const refuses = /\b(do not approve|don't approve|not approved|disapprove|reject this summary|not ready to approve|no approval)\b/i.test(normalisedApproval)
    || /^(?:no(?:[.!?,;:]|$)|no\s+thanks?\b|not\s+(?:yet|now)\b|(?:i|we)\s+(?:decline|refuse)\b|declined(?:[.!?,;:]|$))/i.test(normalisedApproval);
  if (refuses) throw new Error('This response does not approve the summary. Save the correction and ask the group again.');
  if (phaseId === 4 && Object.values(record.interaction?.candidateDispositions ?? {}).includes('Reconsider')) throw new Error('Resolve the candidates marked Reconsider: revise the candidates in chat or explicitly choose Keep before approval.');
  if (phaseId === 5 && Object.keys(record.interaction?.priorities ?? {}).length) throw new Error('Save and review the pending visual priorities with their reasons and evidence gaps before approving the shortlist.');
  record.phases[phaseId-1].answers = phaseAnswerSchema(record,phaseId).parse(record.phases[phaseId-1].answers);
  validateReferences(record, phaseId);
  Object.assign(record.phases[phaseId-1], {status:'confirmed', approvalNote:approval, approvedAt:now});
  record.revision += 1;
  if (record.interaction) delete record.interaction.undo;
  return validateRecord(record);
}
export function readableSummary(record, phaseId = currentPhase(record) ?? 6) {
  const p = record.phases[phaseId-1];
  const lines = [`Step ${phaseId} of 6: ${phases[phaseId-1].title}`];
  if(phaseId===6) {
    lines.push('AI use cases identified:');
    for(const candidate of record.phases[3].answers.candidates??[]) lines.push(`- ${candidate.title}: ${candidate.aiWork}`);
  }
  const label = key => ({aiWork:'What AI would do',taskIds:'Workflow tasks',humanCheck:'What a person checks',nonAiAlternative:'Without AI',evidenceGap:'What still needs checking',candidateId:'Use case',firstGap:'What to address first',zeroSecond:'If the task took no time',peopleChange:'Changes for people',stopRule:'When to reconsider',underlyingProblem:'The problem we identified',implementation:'Proposed technical approach',kpi:'Success measure / KPI',candidates:'AI use cases'}[key] ?? key.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()));
  const name=(key,value)=>key==='candidateId' ? record.phases[3].answers.candidates?.find(c=>c.id===value)?.title??value : key==='taskIds' ? record.phases[2].answers.tasks?.find(t=>t.id===value)?.work??value : value;
  const display = (object, indent='') => Object.entries(object).forEach(([key,value])=>{
    if (key === 'workflowComparisons') return;
    if (Array.isArray(value)) {
      lines.push(`${indent}${label(key)}:`);
      value.forEach((item,i)=>{ if (typeof item==='object'&&item!==null) {lines.push(`${indent}${i+1}.`);display(item,indent+'  ');} else lines.push(`${indent}- ${name(key,item)}`); });
    } else if(value&&typeof value==='object') {lines.push(`${indent}${label(key)}:`);display(value,indent+'  ');}
    else if(key!=='id') lines.push(`${indent}${label(key)}: ${name(key,value) ?? 'None'}`);
  });
  display(p.answers);
  if(phaseId===6&&p.answers.workflowComparisons?.length)lines.push(readableWorkflowComparisons(record));
  if (!Object.keys(p.answers).length) lines.push('No answers recorded for this phase yet.');
  const interaction = record.interaction;
  if (interaction) {
    const candidate = candidateId => record.phases[3].answers.candidates?.find(item=>item.id===candidateId)?.title ?? candidateId;
    if (phaseId === 2 && Object.keys(interaction.barrierCategories).length) {
      lines.push('Group-selected barrier categories:');
      for (const [index,category] of Object.entries(interaction.barrierCategories)) lines.push(`- ${p.answers.blockers?.[Number(index)]?.information ?? `Barrier ${Number(index)+1}`}: ${category}`);
    }
    if (phaseId === 3 && interaction.zeroTaskId) lines.push(`Task selected for the zero-second question: ${p.answers.tasks?.find(task=>task.id===interaction.zeroTaskId)?.work ?? interaction.zeroTaskId}.`);
    if (phaseId === 4 && Object.keys(interaction.candidateDispositions).length) {
      lines.push('Group candidate review choices:');
      for (const [candidateId,disposition] of Object.entries(interaction.candidateDispositions)) lines.push(`- ${candidate(candidateId)}: ${disposition}`);
      if (Object.values(interaction.candidateDispositions).includes('Reconsider')) lines.push('Resolve the candidates marked Reconsider before approving this phase.');
    }
    if (phaseId === 5 && Object.keys(interaction.priorities).length) {
      lines.push('Pending priority selections, not yet reconciled with the saved reasons and evidence gaps:');
      for (const [candidateId,priority] of Object.entries(interaction.priorities)) lines.push(`- ${candidate(candidateId)}: ${priority}`);
    }
  }
  return lines.join('\n');
}
