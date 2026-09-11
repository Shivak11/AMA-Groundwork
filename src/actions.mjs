import { z } from 'zod';
import { answerSchemas, barrierCategorySchema, interactionSelectionsSchema, prioritySchema, reopenPhase, savePhase, validateRecord } from './workshop.mjs';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const selectionId = id.refine(value=>value!=='__proto__','Rename the reserved candidate ID before recording a visual selection.');
const common = { expectedRevision:z.number().int().min(0), phaseId:z.number().int().min(1).max(6) };
const action = (kind, fields={}) => z.object({...common,kind:z.literal(kind),...fields}).strict();
export const actionSchema = z.discriminatedUnion('kind', [
  action('set_answer', {field:z.string().min(1).max(80),value:z.unknown()}),
  action('classify_barrier', {index:z.number().int().min(0).max(4),category:barrierCategorySchema}),
  action('reorder_tasks', {taskIds:z.array(id).min(2).max(6)}),
  action('choose_zero_task', {taskId:id}),
  action('candidate_disposition', {candidateId:selectionId,disposition:z.enum(['Keep','Reconsider'])}),
  action('prioritise', {candidateId:selectionId,priority:prioritySchema}),
  action('undo'),
]);

const selections = record => interactionSelectionsSchema.parse(record.interaction
  ? Object.fromEntries(Object.entries(record.interaction).filter(([key])=>key!=='undo')) : {});
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function remember(before, after, phaseId, label) {
  after.interaction = {...selections(after),undo:{phaseId,label,answers:structuredClone(before.phases[phaseId-1].answers),
    states:before.phases.map(({answers,...state})=>state),selections:selections(before)}};
  return validateRecord(after);
}
function undo(record, phaseId) {
  const previous = record.interaction?.undo;
  if (!previous) throw new Error('There is no action to undo.');
  if (previous.phaseId !== phaseId) throw new Error(`The last action belongs to phase ${previous.phaseId}.`);
  record.phases = record.phases.map((phase,index)=>({...previous.states[index],answers:index===phaseId-1 ? previous.answers : phase.answers}));
  record.interaction = previous.selections;
  record.revision += 1;
  return validateRecord(record);
}
function requirePhase(request, phaseId) {
  if (request.phaseId !== phaseId) throw new Error(`This action belongs to phase ${phaseId}.`);
}
function uniqueIds(items, key, label) {
  const ids = items.map(item=>item[key]);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must have unique IDs before making this choice.`);
  return new Set(ids);
}
function candidateIds(record) { return uniqueIds(record.phases[3].answers.candidates ?? [],'id','Candidates'); }
function checkFieldReferences(record, phaseId, field, value) {
  if (phaseId === 3 && field === 'chosenWorkflow' && !record.phases[2].answers.workflows?.includes(value)) throw new Error('Choose one of the recorded workflow alternatives.');
  if (phaseId === 3 && field === 'tasks') uniqueIds(value,'id','Tasks');
  if (phaseId === 4 && field === 'candidates') {
    uniqueIds(value,'id','Candidates');
    const tasks=uniqueIds(record.phases[2].answers.tasks ?? [],'id','Tasks');
    for (const candidate of value) {
      if (new Set(candidate.taskIds).size !== candidate.taskIds.length || candidate.taskIds.some(taskId=>!tasks.has(taskId))) throw new Error('Link each candidate only to unique recorded task IDs.');
    }
  }
  if (phaseId === 5 && field === 'choices') {
    uniqueIds(value,'candidateId','Priority choices');
    const ids=candidateIds(record);
    if (value.some(choice=>!ids.has(choice.candidateId))) throw new Error('Priorities must refer to recorded candidates.');
    if (value.filter(choice=>choice.decision==='First').length>1) throw new Error('Choose at most one candidate First.');
  }
  if (phaseId === 6 && field === 'candidateId' && value !== null) {
    if (record.phases[5].answers.decision === 'Do not pilot yet') throw new Error('A no-pilot recommendation cannot select a pilot candidate.');
    if (!candidateIds(record).has(value) || !record.phases[4].answers.choices?.some(choice=>choice.candidateId===value && choice.decision==='First')) throw new Error('Choose the candidate recorded First before proposing its test.');
  }
  if (phaseId === 6 && field === 'decision' && value === 'Test a use case' && !record.phases[4].answers.choices?.some(choice=>choice.decision==='First')) throw new Error('Choose a candidate First in phase 5 before proposing an AI test.');
}

export function applyWorkshopAction(input, inputAction) {
  const record = validateRecord(input);
  const request = actionSchema.parse(inputAction);
  if (request.expectedRevision !== record.revision) throw new Error(`This action expected revision ${request.expectedRevision}, but the supplied record is revision ${record.revision}. Use the latest record and review the choice again.`);
  const {phaseId} = request;
  if (request.kind === 'undo') return undo(record,phaseId);
  const changed = reopenPhase(record,phaseId);
  if (request.kind === 'set_answer') {
    if (!Object.hasOwn(answerSchemas[phaseId-1].shape,request.field)) throw new Error('Choose an answer field belonging to this phase.');
    const value = answerSchemas[phaseId-1].shape[request.field].parse(request.value);
    checkFieldReferences(record,phaseId,request.field,value);
    const patch = {[request.field]:value};
    if (phaseId === 6 && request.field === 'decision' && value === 'Do not pilot yet') patch.candidateId=null;
    if (Object.entries(patch).every(([field,next])=>same(record.phases[phaseId-1].answers[field],next))
      && !(phaseId === 5 && request.field === 'choices' && Object.keys(record.interaction?.priorities ?? {}).length)) return record;
    return remember(record,savePhase(record,phaseId,patch),phaseId,`Change ${request.field}`);
  }
  const selection=selections(record);
  if (request.kind === 'classify_barrier') {
    requirePhase(request,2);
    if (!record.phases[1].answers.blockers?.[request.index]) throw new Error('Choose a recorded barrier before classifying it.');
    if (selection.barrierCategories[request.index] === request.category) return record;
    selection.barrierCategories[request.index]=request.category;
  } else if (request.kind === 'reorder_tasks') {
    requirePhase(request,3);
    const tasks=record.phases[2].answers.tasks ?? [];
    const ids=uniqueIds(tasks,'id','Tasks');
    if (request.taskIds.length !== tasks.length || new Set(request.taskIds).size !== tasks.length || request.taskIds.some(taskId=>!ids.has(taskId))) throw new Error('Reorder every recorded task exactly once; do not add or remove task IDs.');
    if (same(request.taskIds,tasks.map(task=>task.id))) return record;
    const ordered=request.taskIds.map(taskId=>tasks.find(task=>task.id===taskId));
    return remember(record,savePhase(record,3,{tasks:ordered}),3,'Reorder workflow tasks');
  } else if (request.kind === 'choose_zero_task') {
    requirePhase(request,3);
    if (!uniqueIds(record.phases[2].answers.tasks ?? [],'id','Tasks').has(request.taskId)) throw new Error('Choose a recorded task for the zero-second question.');
    if (selection.zeroTaskId === request.taskId) return record;
    selection.zeroTaskId=request.taskId;
    delete changed.phases[2].answers.zeroSecond;
  } else if (request.kind === 'candidate_disposition') {
    requirePhase(request,4);
    if (!candidateIds(record).has(request.candidateId)) throw new Error('Choose a recorded candidate.');
    if (selection.candidateDispositions[request.candidateId] === request.disposition) return record;
    selection.candidateDispositions={...selection.candidateDispositions,[request.candidateId]:request.disposition};
  } else if (request.kind === 'prioritise') {
    requirePhase(request,5);
    const ids=candidateIds(record);
    if (!ids.has(request.candidateId)) throw new Error('Choose a recorded candidate.');
    const choices=record.phases[4].answers.choices ?? [];
    uniqueIds(choices,'candidateId','Priority choices');
    if (choices.some(choice=>!ids.has(choice.candidateId))) throw new Error('The saved shortlist contains a removed candidate. Reconcile the choices in chat before changing priorities.');
    let effective={...Object.fromEntries(choices.map(choice=>[choice.candidateId,choice.decision])),...selection.priorities};
    if (effective[request.candidateId] === request.priority) return record;
    effective={...effective,[request.candidateId]:request.priority};
    if (Object.values(effective).filter(priority=>priority==='First').length>1) throw new Error('Choose at most one candidate First. Change the existing First priority before selecting another.');
    // A new priority does not establish that the previous reason still supports it.
    selection.priorities={...selection.priorities,[request.candidateId]:request.priority};
  }
  changed.interaction=selection;
  const labels={classify_barrier:'Classify a barrier',choose_zero_task:'Choose a zero-second task',candidate_disposition:'Review a candidate',prioritise:'Change a candidate priority'};
  return remember(record,changed,phaseId,labels[request.kind]);
}
