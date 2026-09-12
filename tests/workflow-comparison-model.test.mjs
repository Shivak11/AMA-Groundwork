import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWorkflowComparisons,comparisonIssues} from '../src/workflow-comparison.mjs';
import {savePhase,confirmPhase,validateRecord,phaseReadiness,readableSummary,currentPhase} from '../src/workshop.mjs';
import {nextConversationQuestion} from '../src/conversation.mjs';
import {applyWorkshopAction} from '../src/actions.mjs';
import {comparisonExample,mappings} from '../examples/workflow-comparison.mjs';
const approval='Our group approves the saved comparison and recommendation.';

test('reference mapping preserves exact current and proposed wording, unequal lengths and every deferred case',()=>{
  const record=comparisonExample(), before=structuredClone(record);
  const result=buildWorkflowComparisons(record);
  assert.equal(result.length,2);assert.equal(result[0].mode,'aligned');
  assert.equal(result[0].stages[0].proposed.length,0);
  assert.equal(result[0].stages[2].proposed.length,4);
  for(const item of result) {
    const source=record.phases[3].answers.candidates.find(c=>c.id===item.candidateId);
    assert.deepEqual(item.stages.flatMap(s=>s.proposed),source.workflow);
    assert.equal(item.humanCheck,source.humanCheck);assert.deepEqual(item.components,source.implementation.components);
    assert.equal(item.priority,'Later');
  }
  assert(!result[0].current.some(task=>task.action===record.phases[2].answers.tasks[1].work));
  assert.deepEqual(record,before);
  assert.equal(currentPhase(record),null);
});

test('an explicit added step retains the recorded order and may have no current-side task',()=>{
  const record=comparisonExample({confirm:false});
  const next=structuredClone(mappings);
  next[0].stages=[{taskIds:['t1'],proposedStepIndices:[]},{taskIds:['t3'],proposedStepIndices:[0]},
    {taskIds:[],proposedStepIndices:[1,2]},{taskIds:['t4'],proposedStepIndices:[3,4]}];
  const saved=savePhase(record,6,{workflowComparisons:next});
  assert.equal(phaseReadiness(saved,6).complete,true);
  assert.equal(buildWorkflowComparisons(confirmPhase(saved,6,approval))[0].stages[2].current.length,0);
});

const invalidMappings={
  'duplicate candidate': list=>list.push(structuredClone(list[0])),
  'unknown candidate': list=>list[0].candidateId='missing',
  'unrelated task': list=>list[0].stages[0].taskIds=['t2'],
  'duplicate task': list=>list[0].stages[1].taskIds=['t1','t3'],
  'omitted task': list=>list[0].stages[0].taskIds=[],
  'duplicate proposed step': list=>list[0].stages[2].proposedStepIndices=[1,2,2,3,4],
  'omitted proposed step': list=>list[0].stages[2].proposedStepIndices=[1,2,3],
  'reordered proposed step': list=>list[0].stages[2].proposedStepIndices=[2,1,3,4],
  'unknown proposed step': list=>list[0].stages[2].proposedStepIndices=[1,2,3,7],
  'empty stage': list=>list[0].stages.push({taskIds:[],proposedStepIndices:[]}),
};
for(const [label,edit] of Object.entries(invalidMappings)) test(`confirmation rejects ${label}; draft readback does not pretend alignment`,()=>{
  const next=structuredClone(mappings);edit(next);
  const draft=savePhase(comparisonExample({confirm:false}),6,{workflowComparisons:next});
  assert(comparisonIssues(draft).length);
  assert.equal(phaseReadiness(draft,6).complete,false);
  assert.equal(nextConversationQuestion(draft).field,'workflowComparisons');
  assert.throws(()=>confirmPhase(draft,6,approval),/workflow comparison/i);
  assert(buildWorkflowComparisons(draft).every(item=>item.mode==='separate'));
  const repaired=savePhase(draft,6,{workflowComparisons:[]});
  assert.equal(phaseReadiness(repaired,6).complete,true);
});

test('mapping indices and count are bounded by the schema',()=>{
  for(const bad of [-1,8,0.5,'1']) {
    const next=structuredClone(mappings);next[0].stages[0].proposedStepIndices=[bad];
    assert.throws(()=>savePhase(comparisonExample({confirm:false}),6,{workflowComparisons:next}));
  }
});

test('legacy and already-completed records without mapping remain complete and use separate sequences',()=>{
  const record=comparisonExample();delete record.phases[5].answers.workflowComparisons;
  assert(validateRecord(record));assert.equal(nextConversationQuestion(record).kind,'complete');
  assert(buildWorkflowComparisons(record).every(item=>item.mode==='separate'));
  for(const candidate of record.phases[3].answers.candidates)delete candidate.workflow;
  delete record.experienceVersion;
  Object.assign(record.phases[5].answers,{decision:'Do not pilot yet',candidateId:null,owner:'Unknown',evidence:'Unknown',peopleChange:'Unknown',test:'Not proposed',stopRule:'Not proposed'});
  assert(validateRecord(record));
  assert(buildWorkflowComparisons(record).every(item=>item.proposed.length===0));
});

test('source corrections remove only derived comparison from new revision; source and later wording survive',()=>{
  for(const id of [3,4]) {
    const original=comparisonExample(), source=structuredClone(original.phases[id-1].answers);
    if(id===3)source.tasks[0].work='Corrected task wording.';
    else source.candidates[0].workflow.reverse();
    const revised=savePhase(original,id,source);
    assert.equal(revised.phases[5].answers.workflowComparisons,undefined);
    assert.equal(revised.phases[5].answers.recommendation,original.phases[5].answers.recommendation);
    assert.deepEqual(original.phases[5].answers.workflowComparisons,mappings);
    assert.equal(revised.phases[5].status,'needs_review');
    assert(buildWorkflowComparisons(revised).every(item=>item.mode==='separate'));
  }
});

test('no-op source saves retain mapping; reorder and undo never reuse stale indices',()=>{
  const original=comparisonExample();
  assert.deepEqual(savePhase(original,4,original.phases[3].answers),original);
  const changed=applyWorkshopAction(original,{kind:'reorder_tasks',phaseId:3,expectedRevision:original.revision,taskIds:['t2','t1','t3','t4','t5']});
  assert.equal(changed.phases[5].answers.workflowComparisons,undefined);
  const undone=applyWorkshopAction(changed,{kind:'undo',phaseId:3,expectedRevision:changed.revision});
  assert(validateRecord(undone));assert.equal(currentPhase(undone),null);
  assert(buildWorkflowComparisons(undone).every(item=>item.mode==='separate'));
});

test('model and readable summary never mutate or expose the internal mapping as participant prose',()=>{
  const record=comparisonExample();
  assert.doesNotMatch(readableSummary(record,6),/proposedStepIndices|workflowComparisons|Task ids/i);
  record.phases[2].status='needs_review';
  assert(buildWorkflowComparisons(record).every(item=>item.mode==='separate'&&item.review));
});
