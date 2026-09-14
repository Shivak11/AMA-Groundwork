import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
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
function canonicalText(result) {
  assert(!result.content.some(block=>block.type==='resource'),'A normal tool response must not create a file attachment.');
  const blocks=result.content.filter(block=>block.type==='text'&&block.text.trim().startsWith('{')).map(block=>JSON.parse(block.text));
  assert.equal(blocks.length,1);assert.deepEqual(blocks[0],result.structuredContent);
  return blocks[0];
}
test('text-only MCP journey generates six cumulative PDFs and receives byte-identical files through the dedicated tool',async()=>{
  const rendered=[];const c=await connected({pdfRenderer:async record=>{rendered.push(structuredClone(record));return stub();}});
  try {
    const list=await c.client.listTools();assert(list.tools.some(t=>t.name==='resume_workshop'));
    const p=await c.client.getPrompt({name:'ai_use_case_workshop',arguments:{}});assert.match(p.messages[0].content.text,/one manageable/);
    let result=await c.client.callTool({name:'start_workshop',arguments:{group,mode:'text'}});
    assert.equal(canonicalText(result).mode,'text');assert.equal(canonicalText(result).view.display,false);
    let record=canonicalText(result).record;
    for(let i=1;i<=6;i++) {
      result=await c.client.callTool({name:'save_workshop_phase',arguments:{record,phase:i,answers:answers[i-1],mode:'text'}});
      assert(!result.isError,JSON.stringify(result));record=canonicalText(result).record;
      assert.equal(canonicalText(result).view.display,false);
      result=await c.client.callTool({name:'confirm_workshop_phase',arguments:{record,phase:i,approved:true,confirmation:'We approve the displayed summary.',mode:'text'}});
      assert(!result.isError,JSON.stringify(result));record=canonicalText(result).record;
      assert.equal(canonicalText(result).view.display,true);
      assert.equal(result.structuredContent.export.status,'ready');
      assert.equal(result.structuredContent.export.downloadTool,'download_workbook_file');
      assert.equal(rendered.length,i*2-1,'Each confirmation still invokes the PDF renderer.');
      assert.deepEqual(rendered.at(-1),record);
      assert.equal(result._meta?.bookHtml,undefined);assert.equal(result._meta?.artifacts?.pdf,undefined);
      assert.equal(result.structuredContent.bookPreview.status,'client-rendered');
      assert(!result.content.some(b=>b.type==='resource'&&['application/pdf','application/gzip'].includes(b.resource.mimeType)));
      assert.deepEqual(canonicalText(result).record,record);
      const before=structuredClone(record);
      const file=await c.client.callTool({name:'download_workbook_file',arguments:{record}});
      assert(!file.isError,JSON.stringify(file));
      assert.deepEqual(record,before);assert.equal(rendered.length,i*2);assert.deepEqual(rendered.at(-1),record);
      assert.deepEqual(Object.keys(file.structuredContent),['export']);
      const manifest=file.structuredContent.export;
      assert.equal(manifest.status,'ready');assert.equal(manifest.revision,record.revision);
      assert.equal(manifest.name,`ama-groundwork-r${record.revision}.pdf`);
      assert.equal(manifest.mimeType,'application/pdf');assert.equal(manifest.encoding,'gzip');
      assert.equal(manifest.bytes,(await stub()).length);
      assert.equal(manifest.sha256,createHash('sha256').update(await stub()).digest('hex'));
      const resources=file.content.filter(block=>block.type==='resource');assert.equal(resources.length,1);
      assert.equal(resources[0].resource.mimeType,'application/gzip');
      assert.deepEqual(gunzipSync(Buffer.from(resources[0].resource.blob,'base64')),await stub());
      assert(file.content.some(block=>block.type==='text'));assert.equal(file._meta?.artifacts?.pdf,undefined);
      assert.equal(file._meta?.bookHtml,undefined);assert.equal(file.structuredContent.record,undefined);
      assert(JSON.stringify(file).length<=140000,'The whole file result obeys the host transport ceiling.');
    }
    assert(record.phases.every(p=>p.status==='confirmed'));
    const restored=await c.client.callTool({name:'resume_workshop',arguments:{checkpoint:record,mode:'text'}});
    assert.deepEqual(restored.structuredContent.record,record);
  } finally {await c.close();}
});
test('renderer failure retains confirmed work and permits export retry without another approval',async()=>{
  let fail=true;const c=await connected({pdfRenderer:async()=>{if(fail)throw new Error('Simulated render failure');return stub();}});
  try {
    let r=(await c.client.callTool({name:'start_workshop',arguments:{group}})).structuredContent.record;
    r=(await c.client.callTool({name:'save_workshop_phase',arguments:{record:r,phase:1,answers:answers[0]}})).structuredContent.record;
    const args={record:r,phase:1,approved:true,confirmation:'Approved'};
    const failed=await c.client.callTool({name:'confirm_workshop_phase',arguments:args});
    assert(!failed.isError);assert.equal(r.phases[0].status,'draft');
    assert.equal(failed.structuredContent.record.phases[0].status,'confirmed');
    assert.equal(failed.structuredContent.export.status,'failed');
    assert(!failed._meta.artifacts.pdf);
    fail=false;const success=await c.client.callTool({name:'export_workbook',arguments:{record:failed.structuredContent.record}});
    assert.equal(success.structuredContent.record.phases[0].status,'confirmed');
    assert.equal(success.structuredContent.export.status,'ready');
    assert.equal(success.structuredContent.record.revision,failed.structuredContent.record.revision);
  } finally {await c.close();}
});
test('SDK type/refusal errors and malformed-record errors stay file-free and do not change the last valid checkpoint',async()=>{
  let renders=0;const c=await connected({pdfRenderer:async()=>{renders++;return stub();}});
  try {
    const record=canonicalText(await c.client.callTool({name:'start_workshop',arguments:{group}})).record;
    const before=structuredClone(record);
    for(const request of [
      {name:'save_workshop_phase',arguments:{record,phase:1,answers:{kpi:42}}},
      {name:'confirm_workshop_phase',arguments:{record,phase:1,approved:false,confirmation:'No approval was given.'}},
      {name:'workshop_next',arguments:{record:{schemaVersion:1}}},
    ]) {
      const rejected=await c.client.callTool(request);
      assert.equal(rejected.isError,true);assert.equal(rejected.structuredContent,undefined);
      assert(rejected.content.some(item=>item.type==='text'&&item.text.length));
      assert(!rejected.content.some(item=>item.type==='resource'));assert.deepEqual(record,before);
    }
    const resumed=canonicalText(await c.client.callTool({name:'workshop_next',arguments:{record}}));
    assert.deepEqual(resumed.record,before);assert(resumed.record.phases.every(phase=>phase.status==='draft'));
    assert.equal(resumed.view.display,false);assert.equal(renders,0);
  } finally {await c.close();}
});
test('normal tools use client-rendered previews and retain approval even when PDF generation fails',async()=>{
  for (const pdfFails of [false,true]) {
    let previewCalls=0;
    const c=await connected({bookRenderer:()=>{previewCalls++;throw new Error('A normal tool must not render bundled book HTML.');},pdfRenderer:async()=>{if(pdfFails)throw new Error('PDF failure');return stub();}});
    try {
      let result=await c.client.callTool({name:'start_workshop',arguments:{group,mode:'text'}});
      assert(!result.isError);assert.equal(result.structuredContent.bookPreview.status,'client-rendered');
      result=await c.client.callTool({name:'save_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,answers:answers[0],mode:'text'}});
      result=await c.client.callTool({name:'confirm_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,approved:true,confirmation:'Approved',mode:'text'}});
      assert(!result.isError);assert.equal(result.structuredContent.record.phases[0].status,'confirmed');
      assert.equal(result.structuredContent.export.status,pdfFails?'failed':'ready');
      assert(result._meta.artifacts.checkpoint);assert(!result._meta.bookHtml);
      assert.equal(result._meta.artifacts.pdf,undefined);assert.equal(previewCalls,0);
    } finally {await c.close();}
  }
});

test('the dedicated file tool is read-only, has no UI resource and refuses unavailable or oversized files',async()=>{
  const c=await connected({pdfRenderer:stub});
  try {
    const {tools}=await c.client.listTools();const tool=tools.find(item=>item.name==='download_workbook_file');
    assert(tool);assert.equal(tools.length,11);assert.equal(tool.annotations.readOnlyHint,true);
    assert.equal(tool._meta?.ui?.resourceUri,undefined);assert.equal(tool._meta?.['ui/resourceUri'],undefined);
    assert.equal(tool.outputSchema.type,'object');
    const draft=(await c.client.callTool({name:'start_workshop',arguments:{group}})).structuredContent.record;
    const rejected=await c.client.callTool({name:'download_workbook_file',arguments:{record:draft}});
    assert.equal(rejected.isError,true);assert(!rejected.content.some(block=>block.type==='resource'&&block.resource.mimeType==='application/gzip'));
  } finally {await c.close();}
  const oversized=Buffer.concat([Buffer.from('%PDF-'),randomBytes(120000)]);
  const large=await connected({pdfRenderer:async()=>oversized});
  try {
    let record=(await large.client.callTool({name:'start_workshop',arguments:{group}})).structuredContent.record;
    record=(await large.client.callTool({name:'save_workshop_phase',arguments:{record,phase:1,answers:answers[0]}})).structuredContent.record;
    const confirmed=await large.client.callTool({name:'confirm_workshop_phase',arguments:{record,phase:1,approved:true,confirmation:'Approved'}});
    assert(!confirmed.isError);assert.equal(confirmed.structuredContent.export.status,'ready');
    const latest=structuredClone(confirmed.structuredContent.record);
    const file=await large.client.callTool({name:'download_workbook_file',arguments:{record:latest}});
    assert.equal(file.isError,true,'A file that exceeds the transport ceiling must fail explicitly.');
    assert(!file.content.some(block=>block.type==='resource'&&block.resource.mimeType==='application/gzip'));
    assert.deepEqual(latest,confirmed.structuredContent.record);assert.equal(latest.phases[0].status,'confirmed');
  } finally {await large.close();}
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
test('the read-only shortlist remains readable without UI support',async()=>{
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
    assert.deepEqual(result.structuredContent.phase.answerSchema.properties.choices.items.properties.decision.enum,['First','Later','Do not pursue']);
    assert.match(result.structuredContent.nextQuestion.hint,/First, Later or Do not pursue/);
    assert.equal(result.structuredContent.nextQuestion.field,'choices');
    assert.equal(result.structuredContent.questionTurn.owner,'chat');
  } finally {await c.close();}
});
