import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {group,answers} from '../examples/hiring.mjs';

const endpoint=new URL('https://ai-use-case-workshop.shiva-research11.workers.dev/mcp');
const output=new URL('../output/chat-workbook-remote/',import.meta.url);
await mkdir(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uiCapabilities={extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};
const client=new Client({name:'workshop-chat-workbook-release-check',version:'1.0.0'},{capabilities:uiCapabilities});
const evidence={
  endpoint:endpoint.href,checkedAt:new Date().toISOString(),
  sourceCommit:process.env.WORKSHOP_SOURCE_COMMIT??null,
  deploymentVersion:process.env.WORKSHOP_DEPLOYMENT_VERSION??null,
  boundary:'Real remote MCP tools and Cloudflare-generated PDFs with fictional data. Native question display, embedded UI rendering, human approval and file receipt in Claude or ChatGPT are not tested by this script.',
  checks:[],pdfs:[],
};
let failure,record;
const textOf=result=>result.content.filter(item=>item.type==='text').map(item=>item.text).join('\n');
function assertRouting(result,{field,kind,files=false}={}) {
  const data=result.structuredContent,turn=data.questionTurn;
  assert.equal(turn.owner,'chat');assert.equal(turn.preferredInput,'native_question_tool');assert.equal(turn.fallbackInput,'plain_chat');
  assert.equal(turn.recordRevision,data.record.revision);assert.match(turn.turnId,/^[0-9a-f-]{36}$/);
  if(files) {
    assert.equal(turn.hostAction,'deliver_files');assert.equal(turn.question,null);assert.equal(data.phase.question,null);
    return;
  }
  const next=data.nextQuestion;
  if(field!==undefined) {assert.equal(next.field,field);assert.equal(data.phase.questionField,field);}
  if(kind!==undefined)assert.equal(next.kind,kind);
  assert.equal(turn.field,next.field);assert.equal(turn.question,next.question);
  assert.equal(turn.hostAction,next.kind==='complete'?'offer_workbook':'ask_one_in_host');
  assert.equal(data.phase.question,next.kind==='answer'?next.question:null);
  if(next.question)assert(textOf(result).includes(next.question),'Plain-chat fallback is missing the active question.');
}
function assertCheckpoint(result) {
  const json=result.content.find(item=>item.type==='resource'&&item.resource.mimeType==='application/json');
  assert(json,'The full JSON checkpoint must be returned.');
  assert.deepEqual(JSON.parse(json.resource.text),result.structuredContent.record);
  assert.deepEqual(JSON.parse(result._meta.artifacts.checkpoint.text),result.structuredContent.record);
}
async function call(name,args) {
  const result=await client.callTool({name,arguments:args},undefined,{timeout:90000});
  assert(!result.isError,result.content?.[0]?.text);
  assertCheckpoint(result);assertRouting(result,{files:name==='export_workbook'});
  record=result.structuredContent.record;
  // Retain a recoverable checkpoint even when a later PDF or assertion fails.
  await writeFile(new URL('latest-checkpoint.json',output),JSON.stringify(record,null,2));
  return result;
}
async function expectError(name,args,pattern) {
  const before=structuredClone(record);
  const result=await client.callTool({name,arguments:args},undefined,{timeout:90000});
  assert.equal(result.isError,true,`${name} should be rejected.`);
  if(pattern)assert.match(textOf(result),pattern);
  assert.deepEqual(record,before,'A rejected request must not replace the retained checkpoint.');
  return result;
}
function assertProtected(response) {
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
}

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  const serverVersion=client.getServerVersion();assert.equal(serverVersion.version,'0.4.0');evidence.serverVersion=serverVersion;
  const instructions=client.getInstructions();
  assert.match(instructions,/host conversation owns every workshop question/i);
  assert.match(instructions,/available native question tool/i);assert.match(instructions,/ordinary chat/i);
  assert.match(instructions,/different answer or uncertainty/i);assert.match(instructions,/Never ask the same question in both/i);
  assert.doesNotMatch(instructions,/when owner is ui|the embedded activity owns/i);

  const {tools}=await client.listTools(),{resources}=await client.listResources();
  const visual=new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
  const expectedTools=['start_workshop','workshop_next','present_workshop_question','save_workshop_phase','workshop_action','confirm_workshop_phase','export_workbook','resume_workshop','show_shortlist','show_workbook'];
  assert.equal(tools.length,10);assert.deepEqual(tools.map(tool=>tool.name).sort(),expectedTools.sort());assert.equal(resources.length,6);
  for(const tool of tools) {
    assert.equal(tool._meta?.ui?.resourceUri,visual.has(tool.name)?'ui://workshop/checkpoint.html':undefined,tool.name);
    assert.equal(tool._meta?.['ui/resourceUri'],visual.has(tool.name)?'ui://workshop/checkpoint.html':undefined,tool.name);
  }
  const view=(await client.readResource({uri:'ui://workshop/checkpoint.html'})).contents[0];
  const widget=await readFile(new URL('../dist/widget.html',import.meta.url));
  assert.equal(hash(Buffer.from(view.text)),hash(widget));assert.equal(view._meta.ui.prefersBorder,false);
  assert.deepEqual(view._meta.ui.csp.connectDomains,[]);assert.deepEqual(view._meta.ui.csp.resourceDomains,[]);
  evidence.checks.push({name:'Version 0.4.0, ten tools, exclusive visual metadata and exact built widget served live',pass:true,widgetBytes:widget.length,widgetSha256:hash(widget)});

  let result=await call('start_workshop',{group});assertRouting(result,{field:'outcome',kind:'answer'});
  result=await call('save_workshop_phase',{record,phase:1,answers:{outcome:answers[0].outcome,baseline:answers[0].baseline}});
  assertRouting(result,{field:'kpi',kind:'answer'});
  const beforeProposal=structuredClone(record);
  const presentation={phaseId:1,field:'kpi',question:'Which waiting time should we measure?',choices:[
    {label:'CV to approved offer',value:answers[0].kpi},
    {label:'Approval to release',value:'Elapsed time from approved compensation to release of the offer.'},
  ]};
  const proposed=await call('present_workshop_question',{record,presentation});
  assert.deepEqual(record,beforeProposal);assert.deepEqual(proposed.structuredContent.presentation,presentation);
  assertRouting(proposed,{field:'kpi',kind:'answer'});assert.equal(proposed.structuredContent.phase.question,presentation.question);
  for(const choice of presentation.choices) {assert(textOf(proposed).includes(choice.label));assert(textOf(proposed).includes(choice.value));}
  assert.match(textOf(proposed),/different answer or uncertainty/i);assert.match(textOf(proposed),/No choice is saved yet/i);
  result=await call('save_workshop_phase',{record,phase:1,answers:{kpi:answers[0].kpi}});
  assertRouting(result,{field:'guardrail',kind:'answer'});
  assert.deepEqual(record.phases[0].answers,{outcome:answers[0].outcome,baseline:answers[0].baseline,kpi:answers[0].kpi});
  const beforeView=structuredClone(record);
  result=await call('show_workbook',{record});assert.deepEqual(record,beforeView);
  assertRouting(result,{field:'guardrail',kind:'answer'});assert.equal(result.structuredContent.view.readOnly,true);
  assert.equal(result._meta.artifacts.pdf,undefined);
  await expectError('confirm_workshop_phase',{record,phase:1,approved:true,confirmation:'The fictional group approves this draft.'},/guardrail/);
  evidence.checks.push({name:'Native-first question preference, complete plain-chat proposals, field skipping, preserved partial answers and required guardrail',pass:true});

  for(let phase=1;phase<=6;phase++) {
    if(phase===6) {
      result=await call('save_workshop_phase',{record,phase,answers:{decision:'Do not pilot yet'}});
      assert.equal(record.phases[5].answers.candidateId,null);assertRouting(result,{field:'owner',kind:'answer'});
      evidence.checks.push({name:'No-pilot draft automatically retains a null candidate and skips the pilot-candidate question',pass:true});
    }
    result=await call('save_workshop_phase',{record,phase,answers:answers[phase-1]});
    assert.deepEqual(record.phases[phase-1].answers,answers[phase-1]);assertRouting(result,{field:null,kind:'approval'});
    assert.equal(record.phases[phase-1].status,'draft');
    if(phase===2) await call('workshop_action',{record,action:{kind:'classify_barrier',phaseId:phase,expectedRevision:record.revision,index:1,category:'Authority'}});
    if(phase===3) {
      result=await call('workshop_action',{record,action:{kind:'choose_zero_task',phaseId:phase,expectedRevision:record.revision,taskId:'t5'}});
      assert.equal(record.phases[2].answers.zeroSecond,undefined);assertRouting(result,{field:'zeroSecond',kind:'answer'});
      const preserved=structuredClone(record.phases[2].answers);
      await call('save_workshop_phase',{record,phase,answers:{zeroSecond:answers[2].zeroSecond}});
      assert.deepEqual(record.phases[2].answers,{...preserved,zeroSecond:answers[2].zeroSecond});
    }
    if(phase===4) await call('workshop_action',{record,action:{kind:'candidate_disposition',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',disposition:'Keep'}});
    if(phase===5) {
      result=await call('workshop_action',{record,action:{kind:'prioritise',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',priority:'Later'}});
      assertRouting(result,{field:'choices',kind:'answer'});assert.deepEqual(record.phases[4].answers.choices,answers[4].choices);
      await expectError('confirm_workshop_phase',{record,phase,approved:true,confirmation:'The fictional group approves.'},/pending/i);
      await call('workshop_action',{record,action:{kind:'prioritise',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',priority:'First'}});
      result=await call('save_workshop_phase',{record,phase,answers:answers[4]});assertRouting(result,{field:null,kind:'approval'});
    }
    result=await call('confirm_workshop_phase',{record,phase,approved:true,confirmation:`The fictional live test group approves its saved Step ${phase} summary.`});
    assert.equal(record.phases[phase-1].status,'confirmed');
    assert.equal(result.structuredContent.export.status,'ready',JSON.stringify(result.structuredContent.export));
    const bytes=Buffer.from(result._meta.artifacts.pdf.blob,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);
    const pdfResource=result.content.find(item=>item.type==='resource'&&item.resource.mimeType==='application/pdf');
    assert(pdfResource);assert.equal(pdfResource.resource.blob,result._meta.artifacts.pdf.blob);
    assert.equal(typeof result._meta.bookHtml,'string');assert(result._meta.bookHtml.includes('Prepared by Dr. Shiva Kakkar'));
    await writeFile(new URL(`phase-${phase}.pdf`,output),bytes);
    await writeFile(new URL(`phase-${phase}.json`,output),JSON.stringify(record,null,2));
    await writeFile(new URL(`phase-${phase}.html`,output),result._meta.bookHtml);
    evidence.pdfs.push({phase,bytes:bytes.length,sha256:hash(bytes),revision:record.revision});
    console.log(`Live Step ${phase}: confirmed; Cloudflare PDF returned (${bytes.length} bytes).`);
    if(phase===2) {
      const beforeHistory=structuredClone(record);
      const active=await call('workshop_next',{record});
      const historical=await call('show_workbook',{record,phase:1});
      assert.deepEqual(record,beforeHistory);assert.equal(historical.structuredContent.view.phaseId,1);
      assert.equal(historical.structuredContent.phase.id,3);assert.equal(historical.structuredContent.view.readOnly,true);
      assert.equal(historical.structuredContent.phase.question,active.structuredContent.phase.question);
      assertRouting(historical,{field:'workflows',kind:'answer'});
      evidence.checks.push({name:'Historical workbook snapshot retains active question and exact current record',pass:true});
    }
    if(phase===4) {
      const beforeShortlist=structuredClone(record);
      const shortlist=await call('show_shortlist',{record,mode:'text'});assert.deepEqual(record,beforeShortlist);
      assertRouting(shortlist,{field:'choices',kind:'answer'});assert.equal(shortlist.structuredContent.mode,'text');
      for(const candidate of answers[3].candidates)assert(textOf(shortlist).includes(candidate.title));
    }
  }
  assert(record.phases.every(phase=>phase.status==='confirmed'));assertRouting(result,{field:null,kind:'complete'});
  const beforeCorrection=structuredClone(record);
  result=await call('save_workshop_phase',{record,phase:1,answers:{hypothesis:'Check whether approval readiness is the actual constraint.'}});
  assert(record.phases.slice(1).every(phase=>phase.status==='needs_review'));
  assert.deepEqual(record.phases[0].answers,{...beforeCorrection.phases[0].answers,hypothesis:'Check whether approval readiness is the actual constraint.'});
  for(let i=1;i<6;i++)assert.deepEqual(record.phases[i].answers,beforeCorrection.phases[i].answers);
  assertRouting(result,{field:null,kind:'approval'});
  const corrected=structuredClone(record);
  result=await call('resume_workshop',{checkpoint:record,mode:'text'});assert.deepEqual(record,corrected);assert.equal(result.structuredContent.mode,'text');
  await expectError('workshop_action',{record,action:{kind:'set_answer',phaseId:1,expectedRevision:record.revision-1,field:'outcome',value:'Rejected stale-revision proposal'}},/revision/i);

  const textClient=new Client({name:'workshop-chat-only-release-check',version:'1.0.0'},{capabilities:{}});
  try {
    await textClient.connect(new StreamableHTTPClientTransport(endpoint));
    const text=await textClient.callTool({name:'workshop_next',arguments:{record}},undefined,{timeout:90000});
    assert(!text.isError,textOf(text));assertCheckpoint(text);assertRouting(text,{field:null,kind:'approval'});
    assert.deepEqual(text.structuredContent.record,record);assert.equal(text.structuredContent.mode,'text');
  } finally {await textClient.close();}
  evidence.checks.push({name:'Six real cumulative PDFs, conversational action gates, correction preservation, stale-revision rejection and a non-UI client fallback',pass:true});

  const health=await fetch(new URL('/healthz',endpoint));assert(health.ok);assertProtected(health);
  evidence.health=await health.json();assert(evidence.health.enabled&&evidence.health.configured);assert.equal(evidence.health.storage,'none');
  const denied=await fetch(endpoint,{method:'POST',headers:{Origin:'https://hostile.example','Content-Type':'application/json'},body:'{}'});
  assert.equal(denied.status,403);assertProtected(denied);
  const large=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(350001)})});
  assert.equal(large.status,413);assertProtected(large);
  evidence.checks.push({name:'Healthy stateless service, untrusted-origin rejection, request-size limit and protected response headers',pass:true});
} catch(error) {
  failure=error;evidence.failure=error.message;console.error(error.stack);
} finally {
  try {await client.close();} catch(error) {evidence.closeFailure=error.message;if(!failure)failure=error;}
  evidence.result=failure?'fail':'pass';
  if(record)evidence.lastRecord={revision:record.revision,phaseStates:record.phases.map(phase=>({id:phase.id,status:phase.status}))};
  await writeFile(new URL('evidence.json',output),JSON.stringify(evidence,null,2));
}
if(failure)process.exitCode=1;
else console.log('Live conversation-led workbook verification passed; hosted native-question and file-receipt proof remain separate.');
