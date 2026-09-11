import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createWorkshopServer } from '../src/server.mjs';
import { group,answers } from '../examples/shared-services.mjs';

async function connected(options={}) {
  const server=await createWorkshopServer(options);
  const [a,b]=InMemoryTransport.createLinkedPair();
  const client=new Client({name:'workshop-test',version:'1.0.0'},{capabilities:{}});
  await Promise.all([server.connect(a),client.connect(b)]);
  return {client,server,close:async()=>{await client.close();await server.close();}};
}
// Protocol/state tests use a clearly labelled renderer stub. Actual PDF generation
// is independently exercised by the stdio test and the six example exports.
const stub=async()=>Buffer.from('%PDF-renderer-stub-for-protocol-tests');
test('text-only MCP journey uses all six confirmations and exposes actual file resource types',async()=>{
  const c=await connected({pdfRenderer:stub});
  try {
    const list=await c.client.listTools();assert(list.tools.some(t=>t.name==='resume_workshop'));
    const p=await c.client.getPrompt({name:'ai_use_case_workshop',arguments:{}});assert.match(p.messages[0].content.text,/one manageable/);
    let result=await c.client.callTool({name:'start_workshop',arguments:{group,mode:'text'}});
    assert.equal(result.structuredContent.mode,'text');let record=result.structuredContent.record;
    for(let i=1;i<=6;i++) {
      result=await c.client.callTool({name:'save_workshop_phase',arguments:{record,phase:i,answers:answers[i-1],mode:'text'}});
      assert(!result.isError,JSON.stringify(result));record=result.structuredContent.record;
      result=await c.client.callTool({name:'confirm_workshop_phase',arguments:{record,phase:i,approved:true,confirmation:'We approve the displayed summary.',mode:'text'}});
      assert(!result.isError,JSON.stringify(result));record=result.structuredContent.record;
      assert(result.content.some(b=>b.type==='resource'&&b.resource.mimeType==='application/pdf'));
      assert(result.content.some(b=>b.type==='resource'&&b.resource.mimeType==='application/json'));
    }
    assert(record.phases.every(p=>p.status==='confirmed'));
    const restored=await c.client.callTool({name:'resume_workshop',arguments:{checkpoint:record,mode:'text'}});
    assert.deepEqual(restored.structuredContent.record,record);
  } finally {await c.close();}
});
test('renderer failure reports no confirmation and permits identical retry',async()=>{
  let fail=true;const c=await connected({pdfRenderer:async()=>{if(fail)throw new Error('Simulated render failure');return stub();}});
  try {
    let r=(await c.client.callTool({name:'start_workshop',arguments:{group}})).structuredContent.record;
    r=(await c.client.callTool({name:'save_workshop_phase',arguments:{record:r,phase:1,answers:answers[0]}})).structuredContent.record;
    const args={record:r,phase:1,approved:true,confirmation:'Approved'};
    const failed=await c.client.callTool({name:'confirm_workshop_phase',arguments:args});
    assert(failed.isError);assert.equal(r.phases[0].status,'draft');assert.match(failed.content[0].text,/No confirmation was advanced/);
    fail=false;const success=await c.client.callTool({name:'confirm_workshop_phase',arguments:args});
    assert.equal(success.structuredContent.record.phases[0].status,'confirmed');
  } finally {await c.close();}
});
test('a problem correction returns the earliest phase needing review',async()=>{
  const c=await connected({pdfRenderer:stub});
  try {
    let r=(await c.client.callTool({name:'start_workshop',arguments:{group}})).structuredContent.record;
    r=(await c.client.callTool({name:'save_workshop_phase',arguments:{record:r,phase:1,answers:answers[0]}})).structuredContent.record;
    r=(await c.client.callTool({name:'confirm_workshop_phase',arguments:{record:r,phase:1,approved:true,confirmation:'Approved'}})).structuredContent.record;
    const corrected=await c.client.callTool({name:'save_workshop_phase',arguments:{record:r,phase:2,group:{problem:'A changed problem'}}});
    assert.equal(corrected.structuredContent.phase.id,1);
  } finally {await c.close();}
});
test('UI advertisement is checked and explicit text mode overrides it',async()=>{
  const c=await connected({pdfRenderer:stub,capabilitiesOverride:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
  try {
    const a=await c.client.callTool({name:'start_workshop',arguments:{group}});assert.equal(a.structuredContent.mode,'ui-available');
    const b=await c.client.callTool({name:'workshop_next',arguments:{record:a.structuredContent.record,mode:'text'}});assert.equal(b.structuredContent.mode,'text');
  } finally {await c.close();}
});
test('the Prefab shortlist remains readable without UI support',async()=>{
  const c=await connected({pdfRenderer:stub});
  try {
    let r=(await c.client.callTool({name:'start_workshop',arguments:{group,mode:'text'}})).structuredContent.record;
    for(let i=1;i<=4;i++) {
      r=(await c.client.callTool({name:'save_workshop_phase',arguments:{record:r,phase:i,answers:answers[i-1],mode:'text'}})).structuredContent.record;
      r=(await c.client.callTool({name:'confirm_workshop_phase',arguments:{record:r,phase:i,approved:true,confirmation:'Approved',mode:'text'}})).structuredContent.record;
    }
    const result=await c.client.callTool({name:'show_shortlist',arguments:{record:r,mode:'text'}});
    assert(!result.isError);assert.equal(result.structuredContent.mode,'text');
    for(const candidate of answers[3].candidates) assert(result.content[0].text.includes(candidate.title));
    assert.match(result.content[0].text,/strongest reason against/);
  } finally {await c.close();}
});
