import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWorkshopServer } from '../src/server.mjs';
import { group,answers } from '../examples/shared-services.mjs';
import { createRecord, savePhase, confirmPhase } from '../src/workshop.mjs';
import { renderWorkbookHtml } from '../src/render-workbook.mjs';

async function session() {
  const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-protocol-test-stub')});
  const client=new Client({name:'visual-contract-test',version:'1.0.0'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a),client.connect(b)]);
  return {call:(name,args)=>client.callTool({name,arguments:args}),client,close:async()=>{await client.close();await server.close();}};
}
test('conversational actions and corrections use one record, with the same book projection',async()=>{
  const c=await session();
  try {
    let result=await c.call('start_workshop',{group});
    assert.equal(result._meta.bookHtml,undefined);
    assert(renderWorkbookHtml(result.structuredContent.record).includes(group.problem));
    let record=result.structuredContent.record;
    result=await c.call('workshop_action',{record,action:{kind:'set_answer',expectedRevision:record.revision,phaseId:1,field:'baseline',value:'Unknown'}});
    assert(!result.isError,JSON.stringify(result));record=result.structuredContent.record;
    assert.equal(record.phases[0].answers.baseline,'Unknown');
    result=await c.call('save_workshop_phase',{record,phase:1,answers:answers[0]});
    assert(!result.isError);record=result.structuredContent.record;
    result=await c.call('confirm_workshop_phase',{record,phase:1,approved:true,confirmation:'We approve the displayed summary.'});
    assert(!result.isError);record=result.structuredContent.record;
    assert.equal(record.phases[0].status,'confirmed');
    assert(renderWorkbookHtml(result.structuredContent.record).includes(answers[0].outcome));
    assert.equal(result.structuredContent.export.status,'ready');
    const changed=await c.call('workshop_action',{record,action:{kind:'set_answer',expectedRevision:record.revision,phaseId:1,field:'outcome',value:'A corrected group outcome'}});
    assert.equal(changed.structuredContent.record.phases[0].status,'draft');
    assert(!renderWorkbookHtml(changed.structuredContent.record).includes('A corrected group outcome'),'An unconfirmed correction must not enter the approved book.');
  } finally {await c.close();}
});
test('the read-only workbook resource does not require Prefab or another connector',async()=>{
  const c=await session();
  try {
    const tools=await c.client.listTools();
    for(const name of ['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']) {
      const tool=tools.tools.find(t=>t.name===name);assert(tool);assert.equal(tool._meta.ui.resourceUri,'ui://workshop/checkpoint.html');
    }
    for(const name of ['workshop_action','present_workshop_question']) {
      const tool=tools.tools.find(t=>t.name===name);assert(tool);assert.equal(tool._meta?.ui?.resourceUri,undefined);
    }
    const resources=await c.client.listResources();assert(!resources.resources.some(r=>r.uri.includes('prefab')));
    const view=await c.client.readResource({uri:'ui://workshop/checkpoint.html'});
    assert(view.contents[0].text.includes('<title>AMA-Groundwork</title>'));
    assert(!view.contents[0].text.includes('<title>Our AI Use-Case Portfolio</title>'));
    assert.equal(view.contents[0]._meta.ui.prefersBorder,false);
    assert.deepEqual(view.contents[0]._meta.ui.csp.connectDomains,[]);
  } finally {await c.close();}
});
test('presented options return unchanged record and text fallback before an actual selection',async()=>{
  const c=await session();
  try {
    const start=await c.call('start_workshop',{group});
    const record=start.structuredContent.record;
    const presentation={phaseId:1,field:'kpi',question:'How would we recognise less rework?',choices:[{label:'Returned requests',value:'Count requests returned for missing information each week.'}]};
    const result=await c.call('present_workshop_question',{record,presentation,mode:'text'});
    assert(!result.isError);assert.deepEqual(result.structuredContent.record,record);
    assert.deepEqual(result.structuredContent.presentation,presentation);
    assert.equal(result.content[0].text,presentation.question);
    const fallback=JSON.parse(result.content.find(item=>item.type==='text'&&item.text.trim().startsWith('{')).text);
    assert.deepEqual(fallback.presentation,presentation);
    assert.equal(fallback.record.revision,record.revision);assert.equal(fallback.record.phases[0].answers.kpi,undefined);
    assert.equal(fallback.record.phases[0].status,'draft');
    assert.equal(result.structuredContent.mode,'text');
  } finally {await c.close();}
});
test('unresolved visual choices prompt reconciliation instead of premature approval',async()=>{
  const c=await session();
  try {
    let record=createRecord(group);
    for(let phase=1;phase<=3;phase++) record=confirmPhase(savePhase(record,phase,answers[phase-1]),phase,'Our group approves this saved summary.');
    record=savePhase(record,4,answers[3]);
    const candidateId=record.phases[3].answers.candidates[0].id;
    let result=await c.call('workshop_action',{record,action:{expectedRevision:record.revision,phaseId:4,kind:'candidate_disposition',candidateId,disposition:'Reconsider'}});
    assert(!result.isError);assert.match(result.structuredContent.next,/Resolve each candidate marked Reconsider/);
    assert.equal(result.structuredContent.nextQuestion.kind,'answer');assert.equal(result.structuredContent.nextQuestion.field,'candidates');
    assert(!result.structuredContent.next.includes('Ask for approval or corrections'));
    record=confirmPhase(record,4,'Our group approves this saved summary.');
    record=savePhase(record,5,answers[4]);
    const priority=record.phases[4].answers.choices.find(choice=>choice.candidateId===candidateId).decision==='Later'?'Do not pursue':'Later';
    result=await c.call('workshop_action',{record,action:{expectedRevision:record.revision,phaseId:5,kind:'prioritise',candidateId,priority}});
    assert(!result.isError);assert.match(result.structuredContent.next,/Resolve the pending priorit/);
    assert.equal(result.structuredContent.nextQuestion.kind,'answer');assert.equal(result.structuredContent.nextQuestion.field,'choices');
  } finally {await c.close();}
});
