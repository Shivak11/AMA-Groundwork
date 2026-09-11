import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/hiring.mjs';

const pdfStub=async()=>Buffer.from('%PDF-chat-workbook-protocol-test-stub');
const visualTools=new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
async function session(options={}) {
  const server=await createWorkshopServer({pdfRenderer:pdfStub,...options});
  // No native-question or UI capability is advertised. Plain chat must suffice.
  const client=new Client({name:'chat-workbook-regression',version:'1'},{capabilities:{}});
  const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
  return {client,call:async(name,args)=>{
    const result=await client.callTool({name,arguments:args});
    assert(!result.content.some(item=>item.type==='resource'),'Normal tools must not materialise files.');
    assert.equal(result.structuredContent.view.display,!result.isError&&visualTools.has(name),name);
    assert.deepEqual(jsonCheckpoint(result),result.structuredContent.record);
    return result;
  },close:async()=>{await client.close();await server.close();}};
}
function dataOf(result) {assert(!result.isError,result.content?.[0]?.text);return result.structuredContent;}
function completed(through=6) {
  let record=createRecord(group);
  for(let phase=1;phase<=through;phase++) record=confirmPhase(savePhase(record,phase,answers[phase-1]),phase,'Our group approves this saved summary.');
  return record;
}
function jsonCheckpoint(result) {
  const blocks=result.content.filter(item=>item.type==='text'&&item.text.trim().startsWith('{')).map(item=>JSON.parse(item.text));
  assert.equal(blocks.length,1,'One ordinary JSON text block must retain the complete canonical result.');
  assert.deepEqual(blocks[0],result.structuredContent);
  return blocks[0].record;
}

test('only the four snapshot and export tools register a UI resource',async()=>{
  const s=await session();
  try {
    const {tools}=await s.client.listTools();
    const visual=new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
    const names=['start_workshop','workshop_next','present_workshop_question','save_workshop_phase','workshop_action','confirm_workshop_phase','export_workbook','resume_workshop','show_shortlist','show_workbook','download_workbook_file'];
    assert.equal(tools.length,11);assert.deepEqual(tools.map(tool=>tool.name).sort(),names.sort());
    for(const tool of tools) {
      if(visual.has(tool.name)) {
        assert.equal(tool._meta?.ui?.resourceUri,'ui://workshop/checkpoint.html',tool.name);
        assert.equal(tool._meta?.['ui/resourceUri'],'ui://workshop/checkpoint.html',tool.name);
      } else {
        assert.equal(tool._meta?.ui?.resourceUri,undefined,tool.name);
        assert.equal(tool._meta?.['ui/resourceUri'],undefined,tool.name);
      }
    }
    assert.equal(tools.find(tool=>tool.name==='show_workbook').annotations.readOnlyHint,true);
    assert.equal(tools.find(tool=>tool.name==='download_workbook_file').annotations.readOnlyHint,true);
  } finally {await s.close();}
});

test('show_workbook is a snapshot request rather than an answer save, approval or PDF generation',async()=>{
  let renders=0;const s=await session({pdfRenderer:async()=>{renders++;return pdfStub();}});
  try {
    const record=savePhase(createRecord(group),1,{outcome:answers[0].outcome,baseline:'Unknown'}),before=structuredClone(record);
    const result=await s.call('show_workbook',{record});const data=dataOf(result);
    assert.deepEqual(data.record,before);assert.deepEqual(record,before);assert.deepEqual(jsonCheckpoint(result),before);
    assert.equal(data.questionTurn.owner,'chat');assert.equal(data.phase.questionField,'kpi');
    assert.equal(data.record.phases[0].status,'draft');assert.equal(renders,0);
    assert.equal(result._meta?.bookHtml,undefined);assert.equal(data.bookPreview.status,'client-rendered');
    assert.equal(result._meta.artifacts.pdf,undefined);
    const next=await s.call('workshop_next',{record:data.record});
    assert.deepEqual(dataOf(next).record,before);assert.equal(next.structuredContent.phase.questionField,'kpi');
  } finally {await s.close();}
});

test('browsing an earlier saved chapter does not change the conversational phase or record',async()=>{
  const s=await session();
  try {
    const record=completed(3),before=structuredClone(record);
    const result=await s.call('show_workbook',{record,phase:1});const data=dataOf(result);
    assert.deepEqual(data.record,before);assert.deepEqual(jsonCheckpoint(result),before);
    assert.equal(data.view.phaseId,1);assert.equal(data.phase.id,4);assert.equal(data.phase.questionField,'candidates');
    assert.equal(data.questionTurn.phaseId,4);assert.equal(data.record.revision,before.revision);
  } finally {await s.close();}
});

test('partial saves preserve the complete returned record and untouched phase wording',async()=>{
  const s=await session();
  try {
    const record=completed(),before=structuredClone(record);
    const corrected='Keep the agreed hiring goal, and measure its current baseline before proposing a target.';
    const result=await s.call('save_workshop_phase',{record,phase:1,answers:{hypothesis:corrected}});const data=dataOf(result);
    assert.deepEqual(record,before,'A caller checkpoint is not mutated in place.');assert.deepEqual(data.record.group,before.group);
    assert.equal(data.record.schemaVersion,before.schemaVersion);assert.equal(data.record.revision,before.revision+1);
    assert.deepEqual(data.record.phases[0].answers,{...before.phases[0].answers,hypothesis:corrected});
    assert.equal(data.record.phases[0].status,'draft');
    for(let i=1;i<6;i++) {
      assert.deepEqual(data.record.phases[i].answers,before.phases[i].answers,`Phase ${i+1} wording must survive.`);
      assert.equal(data.record.phases[i].status,'needs_review');
    }
    assert.deepEqual(jsonCheckpoint(result),data.record);assert.equal(data.phase.question,null);assert.equal(data.nextQuestion.kind,'approval');
    const restored=await s.call('resume_workshop',{checkpoint:data.record});assert.deepEqual(dataOf(restored).record,data.record);
  } finally {await s.close();}
});

test('array replacements change only their supplied field rather than reconstructing the workbook',async()=>{
  const s=await session();
  try {
    const record=completed(),before=structuredClone(record),replacement=answers[2].tasks.slice(0,3);
    const result=await s.call('save_workshop_phase',{record,phase:3,answers:{tasks:replacement}});const data=dataOf(result);
    assert.deepEqual(data.record.phases[2].answers,{...before.phases[2].answers,tasks:replacement});
    assert.deepEqual(data.record.phases.slice(0,2),before.phases.slice(0,2));
    for(let i=3;i<6;i++)assert.deepEqual(data.record.phases[i].answers,before.phases[i].answers);
    assert.deepEqual(jsonCheckpoint(result),data.record);assert.deepEqual(record,before);
  } finally {await s.close();}
});

test('a host without native questions completes all six phases through text fallback and explicit approvals',async()=>{
  let renders=0;const s=await session({pdfRenderer:async()=>{renders++;return pdfStub();}});
  try {
    let result=await s.call('start_workshop',{group,mode:'text'}),record=dataOf(result).record;
    for(let phase=1;phase<=6;phase++) {
      for(const [field,value] of Object.entries(answers[phase-1])) {
        result=await s.call('save_workshop_phase',{record,phase,answers:{[field]:value},mode:'text'});
        const data=dataOf(result);record=data.record;
        assert.equal(data.questionTurn.owner,'chat');assert.equal(data.questionTurn.fallbackInput,'plain_chat');
        assert.equal(data.mode,'text');assert.equal(record.phases[phase-1].status,'draft');
        if(data.phase.question)assert(result.content[0].text.includes(data.phase.question));
        assert.deepEqual(jsonCheckpoint(result),record);
      }
      assert.deepEqual(record.phases[phase-1].answers,answers[phase-1]);
      assert.equal(result.structuredContent.phase.question,null);assert.equal(result.structuredContent.nextQuestion.kind,'approval');
      assert.equal(renders,phase-1,'Saving or asking must not generate or approve a PDF.');
      result=await s.call('confirm_workshop_phase',{record,phase,approved:true,confirmation:'Our group approves this exact saved summary.',mode:'text'});
      record=dataOf(result).record;assert.equal(record.phases[phase-1].status,'confirmed');assert.equal(renders,phase);
      assert.equal(result.structuredContent.export.status,'ready');
      assert.equal(result.structuredContent.export.downloadTool,'download_workbook_file');
      assert.equal(result._meta?.artifacts?.pdf,undefined);assert.equal(result._meta?.bookHtml,undefined);
      assert(!result.content.some(item=>item.type==='resource'&&['application/pdf','application/gzip'].includes(item.resource.mimeType)));
    }
    assert(record.phases.every(phase=>phase.status==='confirmed'));
    assert.equal(result.structuredContent.nextQuestion.kind,'complete');assert.equal(result.structuredContent.phase.question,null);
  } finally {await s.close();}
});

test('unknown baseline remains valid while an omitted guardrail blocks approval',async()=>{
  let renders=0;const s=await session({pdfRenderer:async()=>{renders++;return pdfStub();}});
  try {
    const {guardrail,...withoutGuardrail}=answers[0];const record=savePhase(createRecord(group),1,{...withoutGuardrail,baseline:'Unknown'});
    const result=await s.call('workshop_next',{record});assert.equal(dataOf(result).phase.questionField,'guardrail');
    const rejected=await s.call('confirm_workshop_phase',{record,phase:1,approved:true,confirmation:'Our group approves this summary.'});
    assert.equal(rejected.isError,true);assert.match(rejected.content[0].text,/guardrail/);assert.equal(renders,0);
    const saved=await s.call('save_workshop_phase',{record,phase:1,answers:{guardrail}});
    assert.equal(dataOf(saved).record.phases[0].answers.baseline,'Unknown');
    const approved=await s.call('confirm_workshop_phase',{record:saved.structuredContent.record,phase:1,approved:true,confirmation:'Our group approves this saved summary.'});
    assert.equal(dataOf(approved).record.phases[0].status,'confirmed');assert.equal(renders,1);
  } finally {await s.close();}
});

test('choosing no pilot skips the pilot candidate question and still permits an explicit complete recommendation',async()=>{
  const s=await session();
  try {
    const record=completed(5);
    const first=await s.call('save_workshop_phase',{record,phase:6,answers:{decision:'Do not pilot yet'}});const firstData=dataOf(first);
    assert.equal(firstData.record.phases[5].answers.candidateId,null);assert.equal(firstData.phase.questionField,'owner');
    const recommendation={...answers[5],decision:'Do not pilot yet',candidateId:null,recommendation:'Measure the approval wait and agree the manual checklist before considering an AI pilot.'};
    const saved=await s.call('save_workshop_phase',{record:firstData.record,phase:6,answers:recommendation});const data=dataOf(saved);
    assert.equal(data.phase.question,null);assert.equal(data.nextQuestion.kind,'approval');
    const approved=await s.call('confirm_workshop_phase',{record:data.record,phase:6,approved:true,confirmation:'Our group approves the no-pilot recommendation.'});
    const final=dataOf(approved);assert(final.record.phases.every(phase=>phase.status==='confirmed'));
    assert.equal(final.record.phases[5].answers.candidateId,null);assert.equal(final.nextQuestion.kind,'complete');
  } finally {await s.close();}
});

test('PDF failure retains approval and export retry delivers files without asking the group again',async()=>{
  let fail=true,renders=0;const s=await session({pdfRenderer:async()=>{renders++;if(fail)throw new Error('Fictional renderer failure');return pdfStub();}});
  try {
    const draft=savePhase(createRecord(group),1,answers[0]);
    const failed=await s.call('confirm_workshop_phase',{record:draft,phase:1,approved:true,confirmation:'Our group approves this saved summary.'});const data=dataOf(failed);
    assert.equal(data.record.phases[0].status,'confirmed');assert.deepEqual(data.record.phases[0].answers,answers[0]);
    assert.equal(data.export.status,'failed');assert.equal(data.export.retryTool,'export_workbook');
    assert.deepEqual(jsonCheckpoint(failed),data.record);assert.equal(failed._meta.artifacts.pdf,undefined);assert.equal(data.phase.questionField,'blockers');
    fail=false;const exported=await s.call('export_workbook',{record:data.record});const delivered=dataOf(exported);
    assert.deepEqual(delivered.record,data.record);assert.equal(delivered.export.status,'ready');assert.equal(renders,2);
    assert.equal(delivered.questionTurn.owner,'chat');assert.equal(delivered.questionTurn.hostAction,'deliver_files');
    assert.equal(delivered.questionTurn.question,null);
    assert.equal(delivered.record.phases[0].approvalNote,data.record.phases[0].approvalNote);
    assert.equal(delivered.record.phases[0].approvedAt,data.record.phases[0].approvedAt);
  } finally {await s.close();}
});

test('changing a complete no-pilot draft to a test asks for the missing candidate before approval',async()=>{
  const s=await session();
  try {
    const record=completed(5);
    const noPilot=await s.call('save_workshop_phase',{record,phase:6,answers:{...answers[5],decision:'Do not pilot yet',candidateId:null}});
    const before=structuredClone(dataOf(noPilot).record);
    const changed=await s.call('save_workshop_phase',{record:before,phase:6,answers:{decision:'Test a use case'}});
    const data=dataOf(changed);
    assert.deepEqual(data.record.phases[5].answers,{...before.phases[5].answers,decision:'Test a use case'});
    assert.equal(data.record.phases[5].answers.candidateId,null);
    assert.equal(data.nextQuestion.kind,'answer');assert.equal(data.nextQuestion.field,'candidateId');
    assert.equal(data.phase.questionField,'candidateId');assert(data.phase.question);
    assert(data.nextQuestion.choices.some(choice=>choice.value===answers[5].candidateId));
    const selected=await s.call('save_workshop_phase',{record:data.record,phase:6,answers:{candidateId:answers[5].candidateId}});
    const selectedData=dataOf(selected);
    assert.equal(selectedData.nextQuestion.kind,'approval');assert.equal(selectedData.phase.question,null);
    assert.deepEqual(selectedData.record.phases[5].answers,{...before.phases[5].answers,decision:'Test a use case',candidateId:answers[5].candidateId});
    const approved=await s.call('confirm_workshop_phase',{record:selectedData.record,phase:6,approved:true,confirmation:'Our group approves the saved test recommendation.'});
    assert.equal(dataOf(approved).record.phases[5].status,'confirmed');
  } finally {await s.close();}
});

test('group-only saves preserve a completed no-pilot recommendation; rejected empty saves retain the same checkpoint',async()=>{
  let renders=0;const s=await session({pdfRenderer:async()=>{renders++;return pdfStub();}});
  try {
    const record=confirmPhase(savePhase(completed(5),6,{...answers[5],decision:'Do not pilot yet',candidateId:null}),6,'Our group approves the no-pilot recommendation.');
    const before=structuredClone(record),members=[...group.members,'Fictional member alias'];
    const renamed=await s.call('save_workshop_phase',{record,phase:6,group:{members}});const data=dataOf(renamed);
    assert.deepEqual(record,before);assert.deepEqual(data.record.phases,before.phases);
    assert.deepEqual(data.record.group,{...before.group,members});assert.equal(data.record.revision,before.revision+1);
    assert.equal(data.nextQuestion.kind,'complete');assert.equal(data.phase.question,null);
    assert.deepEqual(jsonCheckpoint(renamed),data.record);assert.equal(renders,0);
    const empty=await s.call('save_workshop_phase',{record:data.record,phase:6,answers:{}});
    assert.equal(empty.isError,true);assert.deepEqual(empty.structuredContent.record,data.record);
    assert.deepEqual(jsonCheckpoint(empty),data.record);assert.equal(renders,0);
    assert.equal(empty.structuredContent.record.phases[5].status,'confirmed');
  } finally {await s.close();}
});
