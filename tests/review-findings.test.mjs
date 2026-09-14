import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord,savePhase,confirmPhase,phaseReadiness} from '../src/workshop.mjs';
import {applyWorkshopAction} from '../src/actions.mjs';
import {nextConversationQuestion} from '../src/conversation.mjs';
import {group,answers} from '../examples/remote-team.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
function completed(through) {
  let record=createRecord(group);
  for(let phase=1;phase<=through;phase++)record=confirmPhase(savePhase(record,phase,answers[phase-1]),phase,'The fictional group approves this saved summary.');
  return record;
}
test('unchanged scalar retries preserve the last action undo and revision',()=>{
  let record=savePhase(completed(1),2,answers[1]);
  record=applyWorkshopAction(record,{kind:'classify_barrier',phaseId:2,expectedRevision:record.revision,index:0,category:'Access'});
  assert(record.interaction.undo);
  const unchanged=savePhase(record,2,{firstGap:answers[1].firstGap});
  assert.deepEqual(unchanged,record);
  const restored=applyWorkshopAction(unchanged,{kind:'undo',phaseId:2,expectedRevision:unchanged.revision});
  assert.notDeepEqual(restored.interaction.barrierCategories,record.interaction.barrierCategories);
});
test('duplicate shortlist references ask to repair priorities, never the phase-six candidate',()=>{
  const record=savePhase(completed(4),5,{...answers[4],choices:[answers[4].choices[0],{...answers[4].choices[0],decision:'Later'}]});
  const readiness=phaseReadiness(record);
  assert.equal(readiness.complete,false);assert.equal(readiness.issues[0].field,'choices');
  const next=nextConversationQuestion(record);
  assert.equal(next.kind,'answer');assert.equal(next.field,'choices');assert.match(next.hint,/unique/);
});
test('file-only ordinary text includes the exact filename and integrity manifest without duplicating bytes',async()=>{
  const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-review-protocol-stub')});
  const client=new Client({name:'file-text-review',version:'1'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  try {
    const result=await client.callTool({name:'download_workbook_file',arguments:{record:completed(1)}});
    assert(!result.isError);
    const json=result.content.filter(item=>item.type==='text' && item.text.startsWith('{')).map(item=>JSON.parse(item.text));
    assert.deepEqual(json,[result.structuredContent]);assert.equal(json[0].export.name,'ama-groundwork-r2.pdf');
    assert.equal(result.content.filter(item=>item.type==='resource').length,1);
  } finally {await client.close();await server.close();}
});
