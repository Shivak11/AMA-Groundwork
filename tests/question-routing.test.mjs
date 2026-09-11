import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/hiring.mjs';
import {nextConversationQuestion} from '../src/conversation.mjs';

// Real MCP routing and state use a labelled PDF stub. This is not host UI proof.
async function session(ui=true) {
  const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-question-routing-test-stub')});
  const client=new Client({name:'question-routing-regression',version:'1'}, {capabilities:ui?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  return {client,call:(name,args)=>client.callTool({name,arguments:args}),close:async()=>{await client.close();await server.close();}};
}
function assertHostQuestion(result,field,kind='answer',preferredInput='native_question_tool') {
  assert(!result.isError,result.content?.[0]?.text);
  const data=result.structuredContent,turn=data.questionTurn;
  assert.equal(turn.owner,'chat');assert.equal(turn.hostAction,'ask_one_in_host');
  assert.equal(turn.preferredInput,preferredInput);assert.equal(turn.fallbackInput,'plain_chat');
  assert.equal(turn.recordRevision,data.record.revision);assert.match(turn.turnId,/^[0-9a-f-]{36}$/);
  assert.equal(turn.field,field);assert.equal(data.nextQuestion.kind,kind);assert.equal(data.nextQuestion.field,field);
  assert.equal(turn.question,data.nextQuestion.question);assert.equal(typeof turn.question,'string');assert(turn.question.trim());
  assert.equal(data.phase.questionField,field);assert.equal(data.phase.question,kind==='answer'?turn.question:null);
  assert(result.content.some(block=>block.type==='text'&&block.text.includes(turn.question)), 'Ordinary chat receives the same complete question.');
  assert(!/wait_for_activity|The embedded activity owns|Return ownership/.test(JSON.stringify(turn)));
  return data;
}

test('UI capability never takes ownership away from native-first chat and its plain-chat fallback',async()=>{
  for(const ui of [true,false]) for(const mode of ['auto','text']) {
    const s=await session(ui);
    try {
      const preference=mode==='text'?'plain_chat':'native_question_tool';
      const first=await s.call('start_workshop',{group,mode});const data=assertHostQuestion(first,'outcome','answer',preference);
      const next=await s.call('workshop_next',{record:data.record,mode});assertHostQuestion(next,'outcome','answer',preference);
      assert.notEqual(next.structuredContent.questionTurn.turnId,data.questionTurn.turnId);
      assert.deepEqual(next.structuredContent.record,data.record);
      const instructions=s.client.getInstructions();
      assert.match(instructions,/native/i);assert.match(instructions,/available/i);assert.match(instructions,/ordinary chat|plain chat/i);
      assert.doesNotMatch(instructions,/when owner is ui|the embedded activity owns/i);
    } finally {await s.close();}
  }
});

test('next question skips saved fields and asks for approval only after the draft is complete',async()=>{
  const s=await session();
  try {
    let result=await s.call('start_workshop',{group});
    result=await s.call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{outcome:answers[0].outcome,baseline:'Unknown'}});
    assertHostQuestion(result,'kpi');assert.match(result.structuredContent.phase.question,/know|measure|KPI/i);
    result=await s.call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{kpi:answers[0].kpi}});
    assertHostQuestion(result,'guardrail');assert.match(result.structuredContent.phase.question,/worse|protect|guardrail/i);
    result=await s.call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{guardrail:answers[0].guardrail,hypothesis:answers[0].hypothesis}});
    const complete=assertHostQuestion(result,null,'approval');assert.equal(complete.record.phases[0].status,'draft');
    assert.match(complete.questionTurn.question,/approv|agree|correct/i);
    result=await s.call('confirm_workshop_phase',{record:complete.record,phase:1,approved:true,confirmation:'Our group approves this saved summary.'});
    const confirmed=assertHostQuestion(result,'blockers');assert.equal(confirmed.questionTurn.phaseId,2);
    assert.equal(confirmed.record.phases[0].status,'confirmed');
  } finally {await s.close();}
});

test('each phase asks its exact next missing field and a completed record asks nothing further',()=>{
  const fieldOrder=[['outcome','kpi','baseline','guardrail','hypothesis'],['blockers','firstGap'],['workflows','chosenWorkflow','recentCase','tasks','zeroSecond','redesign'],['candidates'],['choices','challenge','costs'],['decision','candidateId','owner','evidence','test','stopRule','peopleChange','recommendation']];
  let record=createRecord(group);
  for(let phase=1;phase<=6;phase++) {
    for(const field of fieldOrder[phase-1]) {
      const question=nextConversationQuestion(record);
      assert.equal(question.kind,'answer',`Phase ${phase}, before ${field}`);assert.equal(question.field,field,`Phase ${phase}`);
      assert.equal(typeof question.question,'string');assert(question.question.trim());
      record=savePhase(record,phase,{[field]:answers[phase-1][field]});
    }
    const approval=nextConversationQuestion(record);
    assert.equal(approval.kind,'approval');assert.equal(approval.field,null);assert(approval.question);
    record=confirmPhase(record,phase,'Our group approves this saved summary.');
  }
  const completed=nextConversationQuestion(record);
  assert.equal(completed.kind,'complete');assert.equal(completed.field,null);assert.equal(completed.question,null);
});

test('proposed choices appear in the host question and full text fallback without saving an answer',async()=>{
  const s=await session();
  try {
    let start=await s.call('start_workshop',{group});
    start=await s.call('save_workshop_phase',{record:start.structuredContent.record,phase:1,answers:{outcome:answers[0].outcome}});
    const presentation={phaseId:1,field:'kpi',question:'Which waiting time should we measure?',choices:[{label:'CV to approved offer',value:'Elapsed days from the first CV to the first approved offer.'},{label:'Approval to release',value:'Elapsed time from approved pay to offer release.'}]};
    const result=await s.call('present_workshop_question',{record:start.structuredContent.record,presentation});const data=assertHostQuestion(result,'kpi');
    assert.deepEqual(data.presentation,presentation);assert.equal(data.questionTurn.question,presentation.question);
    assert.deepEqual(data.record,start.structuredContent.record);
    for(const choice of presentation.choices) {
      assert(data.nextQuestion.choices.some(item=>item.label===choice.label&&item.value===choice.value));
      assert(result.content[0].text.includes(choice.label));assert(result.content[0].text.includes(choice.value));
    }
    assert.match(result.content[0].text,/own answer|another answer|different answer|uncertain|unknown/i);
    assert.match(result.content[0].text,/No choice is saved yet/i);
  } finally {await s.close();}
});
