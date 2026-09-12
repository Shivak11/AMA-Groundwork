import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from './support/d1-sqlite.mjs';
import {group,deferredAnswers,approval} from '../examples/remote-team.mjs';
import {mappings} from '../examples/workflow-comparison.mjs';

// Local MCP + SQLite only. The PDF stub does not prove rendering or delivery.
test('persistent MCP saves, approves and resumes comparisons without new questions or loss of history',async()=>{
  const db=createSqliteD1(':memory:'),store=createD1SessionStore(db);
  const server=await createWorkshopServer({sessionStore:store,baseUrl:'https://workshop.example',pdfRenderer:async()=>Buffer.from('%PDF-protocol-stub')});
  const client=new Client({name:'comparison-regression',version:'1'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]);
  let ref;
  const call=async(name,args={})=>{
    const result=await client.callTool({name,arguments:{...(ref?{record:ref}:{}),...args}});
    assert(!result.isError,`${name}: ${JSON.stringify(result.content)}`);
    ref=result.structuredContent.record;
    return result;
  };
  try {
    assert.equal(client.getServerVersion().version,'0.8.1');
    await call('start_workshop');await call('start_workshop',{group});
    for(let phase=1;phase<=5;phase++) {
      await call('save_workshop_phase',{phase,answers:deferredAnswers[phase-1]});
      await call('confirm_workshop_phase',{phase,approved:true,confirmation:approval,requestId:`comparison-phase-${phase}`});
    }
    const guide=await call('workshop_next');
    assert(guide.structuredContent.phase.answerSchema.properties.workflowComparisons);
    assert.deepEqual(guide.structuredContent.phase.answerSchema.required,['recommendation']);
    const saved=await call('save_workshop_phase',{phase:6,answers:{recommendation:deferredAnswers[5].recommendation,workflowComparisons:mappings}});
    assert.equal(saved.structuredContent.nextQuestion.kind,'approval');
    const revisedMapping=structuredClone(mappings);
    revisedMapping[0].stages=[{taskIds:['t1','t3'],proposedStepIndices:[0]},{taskIds:['t4'],proposedStepIndices:[1,2,3,4]}];
    const remapped=await call('save_workshop_phase',{phase:6,answers:{workflowComparisons:revisedMapping}});
    assert.deepEqual(remapped._meta.workbook.phases[5].answers.workflowComparisons,revisedMapping);
    const broken=structuredClone(revisedMapping);broken[0].stages[1].proposedStepIndices=[1,1,2,3,4];
    const invalid=await call('save_workshop_phase',{phase:6,answers:{workflowComparisons:broken}});
    assert.equal(invalid.structuredContent.completeness.complete,false);
    const cleared=await call('save_workshop_phase',{phase:6,answers:{workflowComparisons:[]}});
    assert.equal(cleared.structuredContent.completeness.complete,true);
    assert.deepEqual(cleared._meta.workbook.phases.slice(0,5),saved._meta.workbook.phases.slice(0,5));
    await call('save_workshop_phase',{phase:6,answers:{workflowComparisons:mappings}});
    const done=await call('confirm_workshop_phase',{phase:6,approved:true,confirmation:approval,requestId:'comparison-final'});
    assert.equal(done.structuredContent.nextQuestion.kind,'complete');
    assert.equal(done.structuredContent.export.status,'ready');
    assert.deepEqual(done._meta.workbook.phases[5].answers.workflowComparisons,mappings);
    assert.doesNotMatch(done.structuredContent.summary,/proposedStepIndices|workflowComparisons/);
    const oldRef={...ref};
    const resumed=await call('resume_workshop');
    assert.deepEqual(resumed._meta.workbook.phases[5].answers.workflowComparisons,mappings);
    const changedAlignment=await call('save_workshop_phase',{phase:6,answers:{workflowComparisons:revisedMapping}});
    assert.equal(changedAlignment._meta.workbook.phases[5].status,'draft');
    assert.equal(changedAlignment.structuredContent.nextQuestion.kind,'approval');
    await call('confirm_workshop_phase',{phase:6,approved:true,confirmation:approval,requestId:'comparison-reapproved'});
    const candidates=structuredClone(resumed._meta.workbook.phases[3].answers.candidates);
    candidates[0].workflow.reverse();
    const changed=await call('save_workshop_phase',{phase:4,answers:{candidates}});
    assert.equal(changed._meta.workbook.phases[5].answers.workflowComparisons,undefined);
    assert.equal(changed._meta.workbook.phases[5].status,'needs_review');
    const historical=await store.load(oldRef.key,oldRef.revision);
    assert.deepEqual(historical.record.phases[5].answers.workflowComparisons,mappings);
  } finally {await client.close();await server.close();db.close();}
});
