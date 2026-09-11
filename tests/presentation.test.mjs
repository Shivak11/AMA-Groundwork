import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord} from '../src/workshop.mjs';
import {validatePresentation} from '../src/presentation.mjs';

const group={name:'Fictional service team',members:['Sample member'],problem:'Reduce rework in service requests.',context:'Fictional practice',date:'2026-09-11'};
const question={phaseId:1,field:'baseline',question:'Do you know the current starting point?',choices:[{label:'Not measured yet',value:'Unknown. We need to measure returned requests before setting a target.'}]};
test('proposed options do not mutate the group record or invent approval',()=>{
  const record=createRecord(group),before=structuredClone(record);
  assert.deepEqual(validatePresentation(record,question),question);
  assert.deepEqual(record,before);
});
test('rejects another phase, unknown field, structured-field shortcuts and duplicate choices',()=>{
  const record=createRecord(group);
  assert.throws(()=>validatePresentation(record,{...question,phaseId:2}));
  assert.throws(()=>validatePresentation(record,{...question,field:'__proto__'}));
  assert.throws(()=>validatePresentation(record,{...question,field:'blockers'}));
  assert.throws(()=>validatePresentation(record,{...question,choices:[...question.choices,...question.choices]}));
});
