import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {group,answers,approval} from '../examples/persistent-remote-team.mjs';

const endpoint=new URL(process.argv[2]??'https://ai-use-case-workshop.shiva-research11.workers.dev/mcp');
const pdfRequired=!process.argv.includes('--skip-pdf');
const out=new URL(`../output/persistent-${endpoint.hostname==='127.0.0.1'?'local-http':'remote'}-v061/`,import.meta.url);
await mkdir(out,{recursive:true});
const results=[],refs=[];let client,transport;
const sourceHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const connect=async visual=>{
  client=new Client({name:'fictional-workbook-release-check',version:'0.6.1'},{capabilities:visual?{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}:{}});
  transport=new StreamableHTTPClientTransport(endpoint);
  await client.connect(transport);
  assert.equal(client.getServerVersion().version,'0.6.1');
};
const call=async(name,args={})=>{
  const result=await client.callTool({name,arguments:args},undefined,{timeout:60000});
  assert(!result.isError,`${name} failed; inspect the protected local run rather than logging participant data.`);
  if(result.structuredContent?.record?.key){
    const previous=refs.findIndex(r=>r.key===result.structuredContent.record.key);
    if(previous>=0)refs[previous]=result.structuredContent.record;else refs.push(result.structuredContent.record);
  }
  return result;
};
async function saveFiles(result,label) {
  const data=result.structuredContent;
  if(!pdfRequired)return;
  assert.equal(data.export.status,'ready',`${label} PDF export was not ready.`);
  for(const [kind,field] of [['pdf','pdfUrl'],['json','jsonUrl']]) {
    const url=new URL(data.export[field]);
    // Local checks use the same Worker at loopback but retain its fixed public
    // origin in tool output. Never rewrite a live result to a different host.
    assert.equal(url.origin,endpoint.origin);
    const response=await fetch(url);assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(kind==='pdf'){assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert(bytes.length>10000);}
    else assert.equal(JSON.parse(bytes).revision,data.export.revision);
    await writeFile(new URL(`${label}.${kind}`,out),bytes);
    results.push({label,kind,revision:data.export.revision,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
let failure;
try {
  await connect(true);
  const tools=await client.listTools();assert.equal(tools.tools.length,15);
  const widget=await client.readResource({uri:'ui://workshop/checkpoint.html'});
  const expected=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
  assert.equal(widget.contents[0].text,expected);
  let result=await call('start_workshop');
  assert.equal(result.structuredContent.pending,true);
  result=await call('start_workshop',{record:result.structuredContent.record,group,mode:'text'});
  for(let phase=1;phase<=6;phase++) {
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase,answers:answers[phase-1]});
    result=await call('confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`live-approved-${phase}`});
    assert.equal(result._meta.workbook.phases[phase-1].status,'confirmed');
    await saveFiles(result,`phase-${phase}`);
  }
  const completed=result._meta.workbook,originalRef=result.structuredContent.record;
  const readUrl=new URL(result.structuredContent.workspace.url),readKey=readUrl.hash.slice(1);
  await client.close();await connect(false);
  result=await call('resume_workshop',{record:{key:originalRef.key,revision:0}});
  assert.deepEqual(result._meta.workbook,completed);assert.equal(result.structuredContent.mode,'text');
  result=await call('save_workshop_phase',{record:result.structuredContent.record,phase:4,arrayEdits:[{field:'candidates',op:'update',id:answers[3].candidates[0].id,value:{humanCheck:'Fictional correction: the employee checks the detailed update before sharing; the manager reviews the condensed version. No automatic escalation or employee ranking.'}}]});
  assert.equal(result._meta.workbook.phases[3].answers.candidates.length,answers[3].candidates.length);
  assert.equal(result._meta.workbook.phases[4].status,'needs_review');
  for(const phase of [4,5,6])result=await call('confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`live-reapproved-${phase}`});
  await saveFiles(result,'corrected-final');
  const shared=await fetch(new URL('/api/workbook',endpoint),{headers:{Authorization:`Bearer ${readKey}`}});
  assert.equal(shared.status,200);assert.equal((await shared.json()).revision,result.structuredContent.record.revision);
  const denied=await client.callTool({name:'save_workshop_phase',arguments:{record:{key:readKey,revision:result.structuredContent.record.revision},phase:1,answers:{outcome:'Unauthorised change'}}});assert.equal(denied.isError,true);
  const direct=await fetch(new URL('/api/download?kind=json',endpoint),{headers:{Authorization:`Bearer ${readKey}`}});
  assert.equal(direct.status,200);assert.deepEqual(await direct.json(),result._meta.workbook);
  results.push({checks:['version-0.6.1','15-current-tools','exact-widget-bundle','six-saved-approvals','fresh-client-reference-resume','persistent-text-preference','item-correction-retains-siblings','dependent-reapproval','read-only-link','read-key-write-rejected','direct-JSON-download'],widgetBytes:Buffer.byteLength(expected),widgetSha256:createHash('sha256').update(expected).digest('hex')});
}catch(error){failure=error;}
finally {
  // Only the fictional sessions created by this run are deleted. There is no
  // listing or broad cleanup and no participant workbook is selected by name.
  if(client)for(const ref of refs)try {
    const latest=await client.callTool({name:'resume_workshop',arguments:{record:ref}});
    if(latest.isError)continue;
    const deleted=await client.callTool({name:'delete_workshop',arguments:{record:latest.structuredContent.record,confirmed:true,groupName:group.name}});
    assert(!deleted.isError);const gone=await client.callTool({name:'resume_workshop',arguments:{record:ref}});assert.equal(gone.isError,true);
    results.push({fictionalSessionDeleted:true});
  }catch{results.push({fictionalSessionDeleted:false});failure??=new Error('The fictional session needs explicit cleanup.');}
  await client?.close();
  await writeFile(new URL('evidence.json',out),JSON.stringify({sourceHead,checkedAt:new Date().toISOString(),endpoint:endpoint.origin,status:failure?'failed':'passed',pdfRequired,results,boundary:'SDK endpoint and downloaded-byte proof; not an actual Claude or ChatGPT journey.'},null,2));
}
if(failure)throw failure;
console.log(JSON.stringify({status:'passed',pdfRequired,checks:results.length,evidence:new URL('evidence.json',out).pathname}));
