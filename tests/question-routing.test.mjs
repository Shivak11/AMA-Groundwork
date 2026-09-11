import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {group, answers} from '../examples/hiring.mjs';
import {contextForQuestionOwner} from '../src/question-routing.mjs';

async function session(ui=true) {
  const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-question-routing-test')});
  const client=new Client({name:'question-owner-regression',version:'1'}, {capabilities:ui?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  return {client,call:(name,args)=>client.callTool({name,arguments:args}),close:async()=>{await client.close();await server.close();}};
}
function assertUiOwns(result) {
  assert(!result.isError,result.content?.[0]?.text);
  const d=result.structuredContent;
  assert.equal(d.questionTurn.owner,'ui');assert.equal(d.questionTurn.hostAction,'wait_for_activity');
  assert.equal(d.questionTurn.recordRevision,d.record.revision);
  assert.match(d.questionTurn.turnId,/^[0-9a-f-]{36}$/);
  assert.equal(d.phase.question,null);
  assert.match(d.next,/Do not ask another question/);
  assert.match(d.phase.instructions,/ask_user_question/);
  assert(!result.content[0].text.includes('Ask only for missing essentials'));
  assert(!result.content[0].text.includes('Complete this together:'));
}
test('UI results after start, save, correction and approval tell the host to wait rather than ask again',async()=>{
  const s=await session();
  try{
    assert.match(s.client.getInstructions(),/exactly one active question owner/);
    let result=await s.call('start_workshop',{group});assertUiOwns(result);
    result=await s.call('workshop_action',{record:result.structuredContent.record,action:{kind:'set_answer',phaseId:1,expectedRevision:0,field:'outcome',value:answers[0].outcome}});assertUiOwns(result);
    result=await s.call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:answers[0]});assertUiOwns(result);
    result=await s.call('confirm_workshop_phase',{record:result.structuredContent.record,phase:1,approved:true,confirmation:'Our group approves this summary.'});assertUiOwns(result);
    assert.equal(result.structuredContent.questionTurn.phaseId,2);
    const tools=await s.client.listTools();assert(tools.tools.every(tool=>tool.description.includes('Follow returned questionTurn')));
  }finally{await s.close();}
});
test('suggested question is in the UI presentation only, not a second model-facing questionnaire',async()=>{
  const s=await session();
  try{
    const start=await s.call('start_workshop',{group});
    const presentation={phaseId:1,field:'kpi',question:'Which waiting time should we measure?',choices:[{label:'Error to owner assigned',value:'Elapsed time between an error and assigning its owner.'},{label:'Error to resolved',value:'Elapsed time between an error and resolution.'}]};
    const result=await s.call('present_workshop_question',{record:start.structuredContent.record,presentation});assertUiOwns(result);
    assert.deepEqual(result.structuredContent.presentation,presentation);
    assert(!result.content[0].text.includes(presentation.question));
    assert(!result.content[0].text.includes('Error to owner assigned'));
    assert.deepEqual(result.structuredContent.record,start.structuredContent.record);
    const context=contextForQuestionOwner(result.structuredContent,'ui');assert.equal(context.phase.question,null);assert.match(context.next,/visual save or context update is not a request/);
    assert.equal(context.questionTurn.turnId,result.structuredContent.questionTurn.turnId);
    const handoff=contextForQuestionOwner(context,'chat');
    assert.equal(handoff.mode,'text');
    assert(!handoff.next.includes('Wait for the participant to answer there'));
    assert(!handoff.phase.instructions.includes('The embedded activity owns'));
    assert.match(handoff.next,/Chat owns this turn/);
  }finally{await s.close();}
});
test('explicit text mode and non-UI hosts retain one complete conversational path',async()=>{
  for(const ui of [true,false]){
    const s=await session(ui);
    try{
      const result=await s.call('start_workshop',{group,...(ui?{mode:'text'}:{})});
      assert.equal(result.structuredContent.questionTurn.owner,'chat');
      assert.equal(result.structuredContent.mode,'text');
      assert.match(result.structuredContent.next,/Ask only for missing essentials/);
      assert(result.structuredContent.phase.question);
      assert(result.content[0].text.includes(result.structuredContent.phase.question));
      const back=await s.call('workshop_next',{record:result.structuredContent.record,mode:'auto'});
      assert.equal(back.structuredContent.questionTurn.owner,ui?'ui':'chat');
      assert.notEqual(back.structuredContent.questionTurn.turnId,result.structuredContent.questionTurn.turnId);
    }finally{await s.close();}
  }
});
