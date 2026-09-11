import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createRecord, savePhase, confirmPhase} from '../src/workshop.mjs';
import {group, answers} from '../examples/hiring.mjs';

const html=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
const out=new URL('../output/inline-live/',import.meta.url);await mkdir(out,{recursive:true});
const server=await createWorkshopServer({pdfRenderer:async()=>Buffer.from('%PDF-inline-protocol-test-not-a-rendered-document')});
const client=new Client({name:'inline-browser-host',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const page=await browser.newPage({viewport:{width:1180,height:1000},reducedMotion:'reduce'});page.setDefaultTimeout(10000);
const errors=[],checks=[],calls=[],contexts=[],messages=[];page.on('pageerror',error=>errors.push(error.message));
let result,rejectSync=false,rejectMessage=false,hold=false,release;
async function call(name,args){const next=await client.callTool({name,arguments:args});assert(!next.isError,next.content?.[0]?.text);result=next;return next;}
async function emit(next=result){await page.evaluate(payload=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:payload},'*'),next);}
let frame;
async function mount(next){result=next;rejectSync=false;rejectMessage=false;hold=false;release=null;
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe title="MCP Apps verification host" sandbox="allow-scripts" style="border:0;width:100%;height:1400px"></iframe></body></html>');
  await page.evaluate(({html,initial})=>{
    if(window.listener)window.removeEventListener('message',window.listener);
    window.listener=async event=>{
      if(event.source!==document.querySelector('iframe')?.contentWindow)return;
      const request=event.data;if(request?.jsonrpc!=='2.0')return;
      const reply=response=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result:response},'*');
      try{
        if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'Controlled inline host',version:'1'},hostCapabilities:{serverTools:{},updateModelContext:{},message:{text:{}},downloadFile:{},logging:{}},hostContext:{theme:'light',styles:{variables:{'--color-background-primary':'#ffffff','--color-text-primary':'#30302e'}},displayMode:'inline'}});
        else if(request.method==='ui/notifications/initialized')event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial},'*');
        else if(request.method==='tools/call')reply(await window.tool(request.params));
        else if(request.method==='ui/update-model-context'){await window.sync(request.params);reply({});}
        else if(request.method==='ui/message'){await window.chat(request.params);reply({});}
        else if(request.id!==undefined)reply({});
      }catch(error){event.source.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}},'*');}
    };window.addEventListener('message',window.listener);document.querySelector('iframe').srcdoc=html;
  },{html,initial:next});
  frame=page.frameLocator('iframe');await frame.locator('#active-question').waitFor();
}
async function waitRevision(revision){await frame.getByLabel('Complete JSON record',{exact:true}).evaluate((node,expected)=>new Promise((resolve,reject)=>{const start=Date.now();const tick=()=>{const field=document.querySelector('textarea[aria-label="Complete JSON record"]');if(field&&JSON.parse(field.value).revision===expected)return resolve();if(Date.now()-start>8000)return reject(new Error('No expected record revision'));requestAnimationFrame(tick);};tick();}),revision);}
async function waitUntil(predicate){const start=Date.now();while(!predicate()){if(Date.now()-start>8000)throw new Error('Timed out waiting for controlled host state');await new Promise(resolve=>setTimeout(resolve,50));}}
await page.exposeFunction('tool',async params=>{calls.push(params.name);const next=await call(params.name,params.arguments);if(hold){hold=false;await new Promise(resolve=>{release=resolve;});}return next;});
await page.exposeFunction('sync',async params=>{if(rejectSync)throw new Error('Deliberate context-sync failure');contexts.push(params);});
await page.exposeFunction('chat',async params=>{if(rejectMessage)throw new Error('Deliberate message failure');messages.push(params);});
let failure;
try{
  let record=createRecord(group);
  let initial=await call('present_workshop_question',{record,presentation:{phaseId:1,field:'outcome',question:'What should become easier for your team?',choices:[{label:'Reduce the wait for an approved offer',value:answers[0].outcome}]}});
  await mount(initial);assert.equal(await frame.locator('#active-question').innerText(),'What should become easier for your team?');
  await page.screenshot({path:new URL('01-question.png',out).pathname,fullPage:true});
  await frame.getByRole('button',{name:'Reduce the wait for an approved offer',exact:true}).click();
  // Suggestions can select a local draft; the single Save action commits it.
  if(result.structuredContent.record.revision===0)await frame.getByRole('button',{name:'Save answer',exact:true}).click();
  await waitRevision(1);assert.equal(result.structuredContent.record.phases[0].answers.outcome,answers[0].outcome);
  checks.push('Real presented choice saved through MCP App bridge and shared with model context');

  for(let phase=1;phase<=6;phase++){
    const record=result.structuredContent.record;
    await call('save_workshop_phase',{record,phase,answers:answers[phase-1]});
    await emit();
    await waitRevision(result.structuredContent.record.revision);
    if(phase===2){
      for(const blocker of answers[1].blockers){
        const revision=result.structuredContent.record.revision;
        await frame.getByRole('button',{name:'Missing information',exact:true}).click();
        await waitRevision(revision+1);
      }
    }
    if(phase===3){
      const revision=result.structuredContent.record.revision;
      await frame.locator('[data-task-id]').first().click();
      await waitRevision(revision+1);
      await call('save_workshop_phase',{record:result.structuredContent.record,phase:3,answers:{zeroSecond:answers[2].zeroSecond}});
      await emit();await waitRevision(result.structuredContent.record.revision);
    }
    if(phase===4){
      for(const candidate of answers[3].candidates){
        const revision=result.structuredContent.record.revision;
        await frame.getByRole('button',{name:/^Keep for comparison/}).click();
        await waitRevision(revision+1);
      }
    }
    await page.screenshot({path:new URL(`step-${phase}.png`,out).pathname,fullPage:true});
    // The complete record has all reasoning. The view can show its single approval gate.
    const review=frame.locator('#phase-review');
    if(await review.count())await review.evaluate(node=>{if(node.tagName==='DETAILS')node.open=true;});
    const approve=frame.getByRole('button',{name:`Approve Step ${phase} and add to workbook`,exact:true});
    const revision=result.structuredContent.record.revision;
    await approve.click();
    await waitRevision(revision+1);
    assert.equal(result.structuredContent.record.phases[phase-1].status,'confirmed');
  }
  checks.push('All six approvals call actual MCP tools and carry PDF metadata; PDF bytes are an explicit protocol stub in this harness');
  await frame.getByRole('button',{name:'Open workbook',exact:true}).first().click();
  await frame.locator('#workshop-book-dialog').waitFor({state:'visible'});
  await page.screenshot({path:new URL('book.png',out).pathname});
  await frame.getByRole('button',{name:'Close workbook',exact:true}).click();
  checks.push('Cumulative real book HTML opens from the growing preview');

  // A chat update must not hide an unfinished visual draft or leave the UI locked.
  await mount(await call('workshop_next',{record:createRecord(group)}));
  await frame.getByLabel('Your group’s answer',{exact:true}).fill('Our unsaved wording about delays.');
  await call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{outcome:answers[0].outcome}});
  await emit();await waitRevision(result.structuredContent.record.revision);
  assert.equal(await frame.getByLabel('Your group’s answer',{exact:true}).inputValue(),'Our unsaved wording about delays.');
  assert(await frame.getByRole('button',{name:'Save answer',exact:true}).isDisabled());
  await frame.getByRole('button',{name:'Cancel edit',exact:true}).click();
  await frame.locator('[data-field="kpi"]').waitFor();
  assert.equal(result.structuredContent.record.phases[0].answers.outcome,answers[0].outcome);
  checks.push('Incoming saved answer keeps the unfinished draft visible; cancellation recovers the latest record without a write');

  // Older and conflicting host records cannot silently replace the authoritative answer.
  const latest=result;
  const old=await client.callTool({name:'workshop_next',arguments:{record:createRecord(group)}});
  await emit(old);await waitRevision(latest.structuredContent.record.revision);
  const conflicting=structuredClone(latest);conflicting.structuredContent.questionTurn.turnId='independent-conflicting-result';conflicting.structuredContent.record.phases[0].answers.outcome='Conflicting wording at the same revision';
  await emit(conflicting);
  await frame.getByText('Compare the current and incoming records',{exact:true}).click();
  assert((await frame.getByLabel('Incoming record for comparison',{exact:true}).inputValue()).includes('Conflicting wording at the same revision'));
  assert((await frame.getByLabel('Current record for comparison',{exact:true}).inputValue()).includes(answers[0].outcome));
  await frame.getByRole('button',{name:'Keep the current record',exact:true}).click();
  await frame.getByRole('button',{name:'Keep the current record',exact:true}).waitFor({state:'hidden'});
  await waitRevision(latest.structuredContent.record.revision);
  assert.equal(JSON.parse(await frame.getByLabel('Complete JSON record',{exact:true}).inputValue()).phases[0].answers.outcome,answers[0].outcome);
  checks.push('Older host record is rejected; same-revision disagreement requires an explicit choice');

  // A newer host update owns the view even when a prior visual action returns late.
  record=savePhase(createRecord(group),1,{outcome:answers[0].outcome,kpi:answers[0].kpi});
  await mount(await call('workshop_next',{record}));hold=true;
  await frame.getByRole('button',{name:'We do not know yet',exact:true}).click();
  await frame.getByRole('button',{name:'Save answer',exact:true}).click();
  await waitUntil(()=>typeof release==='function');
  await call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{guardrail:answers[0].guardrail}});
  const newer=result;await emit(newer);await waitRevision(newer.structuredContent.record.revision);release();
  await frame.locator('[data-field="hypothesis"]').waitFor();
  await waitRevision(newer.structuredContent.record.revision);
  checks.push('Newer chat update survives a late visual-action response');

  record=savePhase(createRecord(group),1,{outcome:answers[0].outcome,kpi:answers[0].kpi});
  await mount(await call('workshop_next',{record}));
  rejectSync=true;
  await frame.getByRole('button',{name:/do not know|Unknown|not measured/i}).first().click();
  const save=frame.getByRole('button',{name:'Save answer',exact:true});if(await save.count() && await save.isEnabled())await save.click();
  await frame.getByRole('button',{name:'Retry sharing',exact:true}).waitFor();
  const saved=result;await emit(saved);
  assert(await frame.getByRole('button',{name:'Retry sharing',exact:true}).isVisible());
  rejectSync=false;await frame.getByRole('button',{name:'Retry sharing',exact:true}).click();
  await frame.getByRole('button',{name:'Retry sharing',exact:true}).waitFor({state:'hidden'});
  checks.push('Accepted choice survives failed context sync and duplicate host echo; acknowledged retry restores editing');

  assert.equal(contexts.at(-1).structuredContent.questionTurn.owner,'ui');
  assert.match(contexts.at(-1).content[0].text,/Do not ask another question/);
  assert(!contexts.at(-1).content[0].text.includes('Ask one missing question'));
  const beforeHandoff=result;
  await frame.getByRole('button',{name:'Discuss in chat',exact:true}).click();
  await frame.locator('#chat-active-title').waitFor();
  await waitUntil(()=>messages.length>0);
  assert.equal(await frame.locator('#active-question').count(),0);
  assert.equal(await frame.locator('[data-field]').count(),0);
  assert.equal(contexts.at(-1).structuredContent.questionTurn.owner,'chat');
  assert.match(messages.at(-1).content[0].text,/participant explicitly chose to continue in chat/);
  await emit(beforeHandoff);
  assert.equal(await frame.locator('#active-question').count(),0);
  assert.equal(contexts.at(-1).structuredContent.questionTurn.owner,'chat');
  await page.screenshot({path:new URL('chat-paused.png',out).pathname,fullPage:true});
  await frame.getByRole('button',{name:'Return to activity',exact:true}).click();
  await frame.locator('#active-question').waitFor();
  assert.equal(contexts.at(-1).structuredContent.questionTurn.owner,'ui');
  checks.push('Visual saves tell the host to wait; explicit discussion pauses all questions, and Return restores sole UI ownership');

  rejectMessage=true;const messageCount=messages.length;
  await frame.getByRole('button',{name:'Discuss in chat',exact:true}).click();
  await frame.getByText('The message could not be sent. Your activity is available again.',{exact:true}).waitFor();
  assert.equal(await frame.locator('#chat-active-title').count(),0);
  assert.equal(contexts.at(-1).structuredContent.questionTurn.owner,'ui');
  assert.equal(messages.length,messageCount);rejectMessage=false;
  await call('workshop_next',{record:result.structuredContent.record,mode:'text'});await emit();
  await frame.locator('#chat-active-title').waitFor();
  assert.equal(await frame.locator('[data-field]').count(),0);
  const textResult=result;
  await frame.getByRole('button',{name:'Return to activity',exact:true}).click();
  await frame.locator('#active-question').waitFor();
  await emit(textResult);
  assert.equal(await frame.locator('#chat-active-title').count(),0);
  await call('workshop_next',{record:result.structuredContent.record,mode:'auto'});await emit();
  await frame.locator('#active-question').waitFor();
  checks.push('Failed message restores UI ownership; text mode pauses inputs; old result echoes cannot reverse either handoff');

  await page.setViewportSize({width:390,height:900});
  assert(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:new URL('mobile.png',out).pathname,fullPage:true});
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:'dark'}},'*'));
  await page.screenshot({path:new URL('dark.png',out).pathname,fullPage:true});
  checks.push('Narrow layout and host theme update');
  assert.deepEqual(errors,[]);
}catch(error){failure=error;console.error(error.stack);await page.screenshot({path:new URL('failure.png',out).pathname,fullPage:true});}
finally{await writeFile(new URL('results.json',out),JSON.stringify({result:failure?'fail':'pass',checks,calls,errors,failure:failure?.message,contextOwners:contexts.map(c=>c.structuredContent.questionTurn?.owner),chatMessages:messages.length,boundary:'Actual bundled React view and MCP tools in a controlled host. Not a Claude/ChatGPT screen; PDF payload here is a test stub.'},null,2));await browser.close();await client.close();await server.close();}
if(failure)process.exitCode=1;else console.log('Inline bridge journey passed.');
