import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema, applyWorkshopAction } from '../src/actions.mjs';
import { createRecord, savePhase, confirmPhase, validateRecord, readableSummary } from '../src/workshop.mjs';
import { group, answers } from '../examples/shared-services.mjs';

const act = (record,phaseId,kind,fields={}) => applyWorkshopAction(record,{expectedRevision:record.revision,phaseId,kind,...fields});
function through(count) {
  let record=createRecord(group);
  for(let phase=1;phase<=count;phase++) record=confirmPhase(savePhase(record,phase,answers[phase-1]),phase,'The test group approves.','2026-09-11T00:00:00.000Z');
  return record;
}

test('old v1 records stay valid without adding interaction state',()=>{
  const record=createRecord(group); assert.deepEqual(validateRecord(record),record); assert.equal(record.interaction,undefined);
});
test('set_answer and undo preserve source records and create increasing revisions',()=>{
  const original=createRecord(group);
  const changed=act(original,1,'set_answer',{field:'outcome',value:'Reduce repeated checking.'});
  assert.deepEqual(original.phases[0].answers,{}); assert.equal(changed.revision,1);
  assert.equal(changed.phases[0].answers.outcome,'Reduce repeated checking.'); assert.equal(changed.interaction.undo.phaseId,1);
  const restored=act(changed,1,'undo'); assert.deepEqual(restored.phases,original.phases); assert.equal(restored.revision,2);
  assert.equal(restored.interaction.undo,undefined); assert.equal(changed.phases[0].answers.outcome,'Reduce repeated checking.');
});
test('undo restores an earlier approval and all downstream review states',()=>{
  const original=through(6); const changed=act(original,1,'set_answer',{field:'baseline',value:'Unknown'});
  assert.equal(changed.phases[0].status,'draft'); assert(changed.phases.slice(1).every(p=>p.status==='needs_review'));
  const restored=act(changed,1,'undo'); assert.deepEqual(restored.phases,original.phases); assert.equal(restored.revision,original.revision+2);
});
test('answer validation, phase gates and revision fences cannot be bypassed',()=>{
  const record=createRecord(group);
  assert.throws(()=>act(record,1,'set_answer',{field:'madeUp',value:'No'}),/field/);
  assert.throws(()=>act(record,1,'set_answer',{field:'outcome',value:''}));
  assert.throws(()=>act(record,2,'set_answer',{field:'firstGap',value:'No'}),/phase 1/);
  assert.throws(()=>applyWorkshopAction(record,{expectedRevision:9,phaseId:1,kind:'set_answer',field:'outcome',value:'No'}),/revision/);
  assert.throws(()=>actionSchema.parse({expectedRevision:0,phaseId:1,kind:'set_answer',field:'outcome',value:'No',approved:true}));
});
test('ordinary saves and confirmations invalidate the one-step undo',()=>{
  let record=act(createRecord(group),1,'set_answer',{field:'outcome',value:'Reduce rework.'});
  record=savePhase(record,1,answers[0]); assert.equal(record.interaction.undo,undefined);
  record=act(record,1,'set_answer',{field:'baseline',value:'Unknown'});
  record=confirmPhase(record,1,'Approved'); assert.equal(record.interaction.undo,undefined);
});
test('undo is bounded to the most recent action and cannot target another phase',()=>{
  let record=act(createRecord(group),1,'set_answer',{field:'outcome',value:'Reduce rework.'});
  record=act(record,1,'set_answer',{field:'kpi',value:'Elapsed time'});
  assert.equal(record.interaction.undo.selections.undo,undefined);
  assert.throws(()=>act(record,2,'undo'),/phase 1/);
  record=act(record,1,'undo'); assert.equal(record.phases[0].answers.outcome,'Reduce rework.'); assert.equal(record.phases[0].answers.kpi,undefined);
  assert.throws(()=>act(record,1,'undo'),/no action/);
});
test('barrier classification preserves supplied words and records only the chosen category',()=>{
  const original=savePhase(through(1),2,answers[1]);
  const changed=act(original,2,'classify_barrier',{index:0,category:'Authority'});
  assert.equal(changed.interaction.barrierCategories['0'],'Authority');
  assert.deepEqual(changed.phases[1].answers,original.phases[1].answers);
  assert.throws(()=>act(original,2,'classify_barrier',{index:4,category:'Trust'}),/recorded barrier/);
  assert.throws(()=>act(original,2,'classify_barrier',{index:0,category:'Predicted'}));
  assert.deepEqual(act(changed,2,'undo').phases,original.phases);
});
test('task reordering is an exact permutation and retains all actor and friction wording',()=>{
  const original=savePhase(through(2),3,answers[2]); const taskIds=answers[2].tasks.map(task=>task.id).reverse();
  const changed=act(original,3,'reorder_tasks',{taskIds});
  assert.deepEqual(changed.phases[2].answers.tasks,[...original.phases[2].answers.tasks].reverse());
  for (const ids of [taskIds.slice(1),taskIds.map(()=>taskIds[0]),[...taskIds.slice(1),'not-recorded']]) assert.throws(()=>act(original,3,'reorder_tasks',{taskIds:ids}));
  assert.deepEqual(act(changed,3,'undo').phases,original.phases);
});
test('zero-second task choice adds no duration, savings or counterfactual answer',()=>{
  const original=savePhase(through(2),3,{tasks:answers[2].tasks});
  const changed=act(original,3,'choose_zero_task',{taskId:answers[2].tasks[0].id});
  assert.equal(changed.interaction.zeroTaskId,answers[2].tasks[0].id);
  assert.equal(changed.phases[2].answers.zeroSecond,undefined); assert.deepEqual(changed.phases[2].answers,original.phases[2].answers);
  assert.throws(()=>act(original,3,'choose_zero_task',{taskId:'not-recorded'}),/recorded task/);
});
test('candidate Keep and Reconsider choices never delete a proposal or imply approval',()=>{
  const original=savePhase(through(3),4,answers[3]); const candidateId=answers[3].candidates[0].id;
  const kept=act(original,4,'candidate_disposition',{candidateId,disposition:'Keep'});
  const changed=act(kept,4,'candidate_disposition',{candidateId,disposition:'Reconsider'});
  assert.equal(changed.interaction.candidateDispositions[candidateId],'Reconsider');
  assert.deepEqual(changed.phases[3].answers,original.phases[3].answers); assert.equal(changed.phases[3].status,'draft');
  assert.throws(()=>confirmPhase(changed,4,'Approved'),/Reconsider/);
  assert.equal(confirmPhase(kept,4,'Approved').phases[3].status,'confirmed');
  const reconciled=savePhase(changed,4,{candidates:answers[3].candidates});
  assert.equal(reconciled.interaction.candidateDispositions[candidateId],undefined);
  assert.equal(confirmPhase(reconciled,4,'Approved').phases[3].status,'confirmed');
  assert.equal(act(changed,4,'undo').interaction.candidateDispositions[candidateId],'Keep');
});
test('incomplete priorities are returned for follow-up without invented reason or evidence',()=>{
  const original=through(4); const [first,second]=answers[3].candidates;
  const changed=act(original,5,'prioritise',{candidateId:first.id,priority:'First'});
  assert.equal(changed.interaction.priorities[first.id],'First'); assert.deepEqual(changed.phases[4].answers,{});
  assert.throws(()=>confirmPhase(changed,5,'Approved'));
  assert.throws(()=>act(changed,5,'prioritise',{candidateId:second.id,priority:'First'}),/at most one/);
  const later=act(changed,5,'prioritise',{candidateId:second.id,priority:'Later'});
  assert.deepEqual(later.interaction.priorities,{[first.id]:'First',[second.id]:'Later'});
  assert.equal(act(later,5,'undo').interaction.priorities[second.id],undefined);
});
test('changing a complete priority keeps old reasoning separate and requires reconciliation before approval',()=>{
  const original=through(6); const first=answers[4].choices.find(choice=>choice.decision==='First');
  const changed=act(original,5,'prioritise',{candidateId:first.candidateId,priority:'Later'});
  assert.deepEqual(changed.phases[4].answers.choices.find(choice=>choice.candidateId===first.candidateId),first);
  assert.equal(changed.interaction.priorities[first.candidateId],'Later');
  assert.throws(()=>confirmPhase(changed,5,'Approved'),/pending visual priorities/);
  assert.equal(changed.phases[5].status,'needs_review'); assert.equal(changed.phases[4].status,'draft');
  assert.deepEqual(act(changed,5,'undo').phases,original.phases);
  const reconciled=savePhase(changed,5,{choices:changed.phases[4].answers.choices.map(choice=>choice.candidateId===first.candidateId ? {...choice,decision:'Later',reason:'The group now wants more evidence before testing.'} : choice)});
  assert.deepEqual(reconciled.interaction.priorities,{});
  assert.equal(confirmPhase(reconciled,5,'Approved').phases[4].status,'confirmed');
});
test('chat saves reconcile completed priorities without losing other incomplete selections',()=>{
  const [first,second]=answers[3].candidates;
  let record=act(through(4),5,'prioritise',{candidateId:first.id,priority:'First'});
  record=act(record,5,'prioritise',{candidateId:second.id,priority:'Later'});
  record=savePhase(record,5,{choices:[{candidateId:first.id,decision:'First',reason:'The group named a relevant delay.',evidenceGap:'Permission remains unknown.'}]});
  assert.equal(record.interaction.priorities[first.id],undefined); assert.equal(record.interaction.priorities[second.id],'Later'); assert.equal(record.interaction.undo,undefined);
});
test('removing source items reconciles selections and removes obsolete undo snapshots',()=>{
  let record=act(through(3),3,'choose_zero_task',{taskId:answers[2].tasks.at(-1).id});
  record=savePhase(record,3,{tasks:answers[2].tasks.slice(0,-1)});
  assert.equal(record.interaction.zeroTaskId,undefined); assert.equal(record.interaction.undo,undefined);
  record=act(through(4),4,'candidate_disposition',{candidateId:answers[3].candidates.at(-1).id,disposition:'Reconsider'});
  record=savePhase(record,4,{candidates:answers[3].candidates.slice(0,-1)});
  assert.deepEqual(record.interaction.candidateDispositions,{});
});
test('no-pilot decision atomically clears the selected candidate and undo restores both',()=>{
  const original=savePhase(through(5),6,answers[5]);
  const changed=act(original,6,'set_answer',{field:'decision',value:'Do not pilot yet'});
  assert.equal(changed.phases[5].answers.candidateId,null);
  assert.throws(()=>act(changed,6,'set_answer',{field:'candidateId',value:answers[5].candidateId}),/no-pilot/);
  assert.deepEqual(act(changed,6,'undo').phases,original.phases);
});
test('typed actions reject wrong phases, nonexistent targets and unknown parameters',()=>{
  const record=through(6);
  assert.throws(()=>act(record,1,'classify_barrier',{index:0,category:'Access'}),/phase 2/);
  assert.throws(()=>act(record,4,'candidate_disposition',{candidateId:'missing',disposition:'Keep'}),/recorded candidate/);
  assert.throws(()=>act(record,5,'prioritise',{candidateId:'missing',priority:'Later'}),/recorded candidate/);
  assert.throws(()=>act(record,3,'reorder_tasks',{taskIds:answers[2].tasks.map(task=>task.id),extra:true}));
  assert.throws(()=>act(record,6,'set_answer',{field:'candidateId',value:'missing'}),/recorded First/);
});
test('malformed interaction and undo states are rejected and snapshots cannot recurse',()=>{
  const base=through(4);
  for (const interaction of [{surprise:true},{barrierCategories:{'7':'Access'}},{priorities:{missing:'First'}},{zeroTaskId:'missing'}]) assert.throws(()=>validateRecord({...base,interaction}));
  const record=act(base,5,'prioritise',{candidateId:answers[3].candidates[0].id,priority:'Later'});
  const nested=structuredClone(record); nested.interaction.undo.selections.undo={}; assert.throws(()=>validateRecord(nested));
  const forged=structuredClone(record); forged.interaction.undo.states.reverse(); assert.throws(()=>validateRecord(forged));
});
test('unchanged choices do not increase revisions or replace the last undo',()=>{
  const record=act(createRecord(group),1,'set_answer',{field:'outcome',value:'Reduce rework.'});
  assert.deepEqual(act(record,1,'set_answer',{field:'outcome',value:'Reduce rework.'}),record);
});
test('object-like candidate IDs cannot change prototypes or silently drop a selection',()=>{
  for (const candidateId of ['constructor','toString','__proto__']) {
    let record=savePhase(through(3),4,{candidates:answers[3].candidates.map((candidate,index)=>index===0 ? {...candidate,id:candidateId} : candidate)});
    record=confirmPhase(record,4,'Approved');
    if (candidateId === '__proto__') {
      assert.throws(()=>act(record,5,'prioritise',{candidateId,priority:'First'}),/reserved candidate ID/);
      assert.throws(()=>validateRecord({...record,interaction:{priorities:{[candidateId]:'First'}}}),/reserved candidate ID/);
    } else {
      const changed=act(record,5,'prioritise',{candidateId,priority:'First'});
      assert.equal(Object.hasOwn(changed.interaction.priorities,candidateId),true);
      assert.equal(changed.interaction.priorities[candidateId],'First');
      assert.equal(Object.getPrototypeOf(changed.interaction.priorities),Object.prototype);
    }
  }
});
test('JSON backup preserves the action and undo while oversize data is rejected before mutation',()=>{
  const record=act(createRecord(group),1,'set_answer',{field:'outcome',value:'Reduce rework.'});
  assert.deepEqual(validateRecord(JSON.parse(JSON.stringify(record))),record);
  const input={...record,unexpected:'x'.repeat(150000)};
  assert.throws(()=>act(input,1,'undo'),/too large/);
  assert.equal(record.phases[0].answers.outcome,'Reduce rework.');
});
test('text-only summaries distinguish pending choices from prior reasoning',()=>{
  const prior=through(5); const first=answers[4].choices.find(choice=>choice.decision==='First');
  const record=act(prior,5,'prioritise',{candidateId:first.candidateId,priority:'Later'});
  const summary=readableSummary(record,5);
  assert.match(summary,/Pending priority selections, not yet reconciled/);
  assert(summary.includes(first.reason)); assert(summary.includes('Later'));
  assert(!summary.includes('undo'));
});
