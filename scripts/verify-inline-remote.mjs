import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {group,answers} from '../examples/hiring.mjs';
const endpoint=new URL('https://ai-use-case-workshop.shiva-research11.workers.dev/mcp');
const output=new URL('../output/inline-remote/',import.meta.url);await mkdir(output,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const client=new Client({name:'workshop-inline-release-check',version:'1.0.0'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const evidence={endpoint:endpoint.href,checkedAt:new Date().toISOString(),sourceCommit:process.env.WORKSHOP_SOURCE_COMMIT,deploymentVersion:process.env.WORKSHOP_DEPLOYMENT_VERSION,boundary:'Real remote tools and Cloudflare PDFs with fictional data, not an actual Claude/ChatGPT conversation.',checks:[],pdfs:[]};
let failure,record;
async function call(name,args){const result=await client.callTool({name,arguments:args},undefined,{timeout:90000});assert(!result.isError,result.content?.[0]?.text);if(result.structuredContent?.record)record=result.structuredContent.record;return result;}
try{
  await client.connect(new StreamableHTTPClientTransport(endpoint));
  assert.equal(client.getServerVersion().version,'0.3.1');
  assert.match(client.getInstructions(),/exactly one active question owner/);
  const tools=await client.listTools(),resources=await client.listResources();assert.equal(tools.tools.length,9);assert.equal(resources.resources.length,6);
  assert(tools.tools.some(tool=>tool.name==='present_workshop_question'));
  const view=(await client.readResource({uri:'ui://workshop/checkpoint.html'})).contents[0];
  const widget=await readFile(new URL('../dist/widget.html',import.meta.url));assert.equal(hash(Buffer.from(view.text)),hash(widget));assert.equal(view._meta.ui.prefersBorder,false);
  evidence.checks.push({name:'Exact built React widget and new question tool served live',pass:true,widgetBytes:widget.length,widgetSha256:hash(widget)});
  const started=await call('start_workshop',{group});
  assert.equal(started.structuredContent.questionTurn.owner,'ui');
  assert.equal(started.structuredContent.phase.question,null);
  assert.match(started.structuredContent.next,/Do not ask another question/);
  const before=structuredClone(record);
  const proposed=await call('present_workshop_question',{record,presentation:{phaseId:1,field:'baseline',question:'Do we know the current waiting time?',choices:[{label:'We have not measured it',value:'Unknown. We need to measure the current waiting time.'}]}});
  assert.deepEqual(record,before);assert(proposed.structuredContent.presentation);
  assert.equal(proposed.structuredContent.questionTurn.owner,'ui');
  assert(!proposed.content[0].text.includes('Do we know the current waiting time?'));
  await call('workshop_action',{record,action:{kind:'set_answer',phaseId:1,expectedRevision:record.revision,field:'baseline',value:proposed.structuredContent.presentation.choices[0].value}});
  for(let phase=1;phase<=6;phase++){
    await call('save_workshop_phase',{record,phase,answers:answers[phase-1]});
    if(phase===2)await call('workshop_action',{record,action:{kind:'classify_barrier',phaseId:phase,expectedRevision:record.revision,index:1,category:'Authority'}});
    if(phase===3){await call('workshop_action',{record,action:{kind:'choose_zero_task',phaseId:phase,expectedRevision:record.revision,taskId:'t5'}});assert.equal(record.phases[2].answers.zeroSecond,undefined);await call('save_workshop_phase',{record,phase,answers:{zeroSecond:answers[2].zeroSecond}});}
    if(phase===4)await call('workshop_action',{record,action:{kind:'candidate_disposition',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',disposition:'Keep'}});
    if(phase===5){await call('workshop_action',{record,action:{kind:'prioritise',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',priority:'Later'}});const blocked=await client.callTool({name:'confirm_workshop_phase',arguments:{record,phase,approved:true,confirmation:'The fictional group approves.'}});assert(blocked.isError);await call('workshop_action',{record,action:{kind:'prioritise',phaseId:phase,expectedRevision:record.revision,candidateId:'c2',priority:'First'}});await call('save_workshop_phase',{record,phase,answers:answers[4]});}
    const result=await call('confirm_workshop_phase',{record,phase,approved:true,confirmation:`The fictional live group approves its saved Step ${phase} summary.`});
    assert.equal(record.phases[phase-1].status,'confirmed');assert.equal(result.structuredContent.export.status,'ready',JSON.stringify(result.structuredContent.export));
    const bytes=Buffer.from(result._meta.artifacts.pdf.blob,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);
    await writeFile(new URL(`phase-${phase}.pdf`,output),bytes);await writeFile(new URL(`phase-${phase}.json`,output),JSON.stringify(record,null,2));await writeFile(new URL(`phase-${phase}.html`,output),result._meta.bookHtml);
    evidence.pdfs.push({phase,bytes:bytes.length,sha256:hash(bytes),revision:record.revision});console.log(`Live Step ${phase}: approved; Cloudflare PDF returned (${bytes.length} bytes).`);
  }
  await call('save_workshop_phase',{record,phase:1,answers:{hypothesis:'Check whether approval readiness is the actual constraint.'}});assert(record.phases.slice(1).every(phase=>phase.status==='needs_review'));
  const text=await call('workshop_next',{record,mode:'text'});assert.equal(text.structuredContent.mode,'text');
  const health=await fetch(new URL('/healthz',endpoint));assert(health.ok);evidence.health=await health.json();assert(evidence.health.enabled&&evidence.health.configured);assert.equal(evidence.health.storage,'none');
  const denied=await fetch(endpoint,{method:'POST',headers:{Origin:'https://hostile.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  const large=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(350001)})});assert.equal(large.status,413);
  evidence.checks.push({name:'Live actions, pending-decision gate, earlier correction, text fallback and access limits',pass:true});
}catch(error){failure=error;evidence.failure=error.message;console.error(error.stack);}
finally{await client.close();evidence.result=failure?'fail':'pass';await writeFile(new URL('evidence.json',output),JSON.stringify(evidence,null,2));}
if(failure)process.exitCode=1;else console.log('Live inline connector verification passed.');
