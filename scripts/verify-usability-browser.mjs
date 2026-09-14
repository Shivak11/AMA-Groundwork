import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {createSqliteD1} from '../tests/support/d1-sqlite.mjs';
import {group,answers,deferredAnswers,rejectedAnswers,approval} from '../examples/remote-team.mjs';

// Controlled browser proof only. It uses the real persistent MCP and bundled
// widget against disposable local SQLite. PDF delivery uses an explicit stub.
// It neither accesses participant workbooks nor automates Claude or ChatGPT.
const out=new URL('../output/usability-browser/',import.meta.url);
const screens=new URL('screens/',out);await mkdir(screens,{recursive:true});
const html=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
const pdfStub=Buffer.from('%PDF-usability-browser-STUB-not-a-rendered-workbook');
const db=createSqliteD1(),store=createD1SessionStore(db);
const server=await createWorkshopServer({sessionStore:store,baseUrl:'https://workshop-usability.test',writesEnabled:true,pdfRenderer:async()=>pdfStub});
const client=new Client({name:'controlled-usability-browser',version:'1'}, {capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1180,height:960},reducedMotion:'reduce'});
const checks=[],screenshots=[],errors=[],requests=[],network=[],downloads=[],metrics=[];
let failure,expectedReference,frame,pauseNextPdf=false,releasePdf,markPdfStarted;
await context.route(/^(https?|wss?):/,route=>{
  const url=new URL(route.request().url());
  if(url.origin==='https://workshop-usability.test'&&url.pathname==='/controlled-host')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
  network.push({origin:url.origin,path:url.pathname});return route.abort();
});
const page=await context.newPage();page.setDefaultTimeout(10000);
page.on('pageerror',error=>errors.push(error.message));
await page.goto('https://workshop-usability.test/controlled-host');
const normal=text=>text.replace(/\s+/g,' ').trim();
const flush=()=>frame.locator('body').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function call(name,args={}) {
  const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,result.content?.[0]?.text);
  if(result._meta?.workbook)assert.equal(result._meta.workbook.revision,result.structuredContent.record.revision);
  return result;
}
await page.exposeFunction('usabilityHostRequest',async request=>{
  requests.push({method:request.method,tool:request.params?.name});
  if(request.method==='tools/call') {
    assert.equal(request.params.name,'download_workbook_file');assert.deepEqual(request.params.arguments,{record:expectedReference});
    if(pauseNextPdf){pauseNextPdf=false;await new Promise(resolve=>{releasePdf=resolve;markPdfStarted();});}
    const result=await client.callTool(request.params);assert.notEqual(result.isError,true);
    const resource=result.content.find(item=>item.type==='resource')?.resource;
    assert.equal(resource?.mimeType,'application/gzip');assert.deepEqual(gunzipSync(Buffer.from(resource.blob,'base64')),pdfStub);return result;
  }
  if(request.method==='ui/download-file') {
    const resource=request.params.contents[0].resource;assert.equal(resource.mimeType,'application/pdf');
    assert.deepEqual(Buffer.from(resource.blob,'base64'),pdfStub);
    downloads.push({revision:expectedReference.revision,bytes:pdfStub.length,stub:true});return {};
  }
  throw new Error(`A read-only workbook made an unexpected host request: ${request.method}`);
});
async function waitRecord(result) {
  await frame.getByLabel('Complete JSON record',{exact:true}).waitFor({state:'attached'});
  await frame.getByLabel('Complete JSON record',{exact:true}).evaluate((node,expected)=>new Promise((resolve,reject)=>{
    const started=performance.now();const check=()=>{
      const actual=document.querySelector('[aria-label="Complete JSON record"]');
      if(actual&&JSON.stringify(JSON.parse(actual.textContent))===expected)return resolve();
      if(performance.now()-started>8000)return reject(new Error('The saved snapshot did not arrive.'));
      requestAnimationFrame(check);
    };check();
  }),JSON.stringify(result._meta.workbook));
  expectedReference=structuredClone(result.structuredContent.record);await flush();
}
async function mount(initial,{theme='light',os='dark'}={}) {
  await page.emulateMedia({colorScheme:os});
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${theme==='dark'?'#21211f':'#fff'}"><iframe id="usability-workbook" title="Controlled workshop host" sandbox="allow-scripts" style="display:block;border:0;width:100%;height:960px"></iframe></body></html>`);
  await page.evaluate(({html,initial,theme})=>{
    if(window.usabilityListener)removeEventListener('message',window.usabilityListener);
    window.usabilityReady=false;
    window.usabilityListener=async event=>{
      const iframe=document.getElementById('usability-workbook');if(event.source!==iframe?.contentWindow)return;
      const request=event.data;if(request?.jsonrpc!=='2.0')return;
      const reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      try {
        if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'Controlled usability host',version:'1'},hostCapabilities:{serverTools:{},downloadFile:{},openLinks:{},message:{text:{}}},hostContext:{theme,displayMode:'inline'}});
        else if(request.method==='ui/notifications/initialized'){event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial},'*');window.usabilityReady=true;}
        else if(request.method==='ui/notifications/size-changed')iframe.style.height=`${Math.min(60000,Math.max(300,Number(request.params.height)||960))}px`;
        else if(request.id!==undefined)reply(await window.usabilityHostRequest(request));
      }catch(error){event.source.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}},'*');}
    };
    addEventListener('message',window.usabilityListener);document.getElementById('usability-workbook').srcdoc=html;
  },{html,initial,theme});
  frame=page.frameLocator('#usability-workbook');await page.waitForFunction(()=>window.usabilityReady);
  await waitRecord(initial);
  assert.equal(await frame.locator('html').evaluate(node=>node.classList.contains('dark')),theme==='dark');
  assert.equal(await frame.locator('.inline-workbook').evaluate(node=>getComputedStyle(node).backgroundColor),'rgba(0, 0, 0, 0)');
}
async function emit(result){await page.evaluate(result=>document.getElementById('usability-workbook').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*'),result);await flush();}
const visibleButton=name=>frame.getByRole('button',{name,exact:true}).filter({visible:true}).first();
async function readOnly(){assert.equal(await frame.locator('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="radio"],[role="checkbox"]').count(),0);}
async function noOverflow(target=frame.locator('body')) {
  const box=await target.evaluate(()=>({width:innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(box.html<=box.width+1&&box.body<=box.width+1,`Horizontal overflow: ${JSON.stringify(box)}`);
}
async function screen(name){const file=new URL(`${name}.png`,screens);await page.screenshot({path:fileURLToPath(file),fullPage:true});screenshots.push(`screens/${name}.png`);}
async function closed(){await readOnly();assert.equal(await frame.locator('#workshop-book-dialog').isVisible(),false);assert.equal(await visibleButton('View workbook').isVisible(),true);}
async function closeBook(){await visibleButton('Close workbook').click();await closed();assert.equal(await visibleButton('View workbook').evaluate(node=>node===document.activeElement),true);}
async function fullText(values){
  const card=frame.locator('.cw-card');const text=normal(await card.innerText());
  for(const value of values)assert(text.includes(normal(value)),`The card shortened or omitted: ${value.slice(0,90)}`);
  const truncated=await card.locator('[data-full-text],.cv-extract').evaluateAll(nodes=>nodes.filter(node=>{
    const style=getComputedStyle(node);
    return style.textOverflow==='ellipsis'||!['none','unset',''].includes(style.webkitLineClamp);
  }).map(node=>node.textContent));assert.deepEqual(truncated,[],'Essential text is clamped or ellipsised.');
}
async function visibleWorkflows(record) {
  for(const candidate of record.phases[3].answers.candidates??[]) {
    const section=frame.locator(`.cv-candidate[data-candidate-id="${candidate.id}"]`).filter({visible:true});
    const flow=section.locator('.cw-use-case-flow');
    const comparison=section.locator(`.wfc-comparison[data-comparison-candidate="${candidate.id}"]`);
    assert.equal((await flow.count())+(await comparison.count()),1,`The visible ${candidate.title} section needs one workflow diagram.`);
    if(await comparison.count()) {
      assert.equal(await comparison.isVisible(),true);
      const text=normal(await comparison.innerText());
      for(const step of candidate.workflow)assert(text.includes(normal(step.action)),`The comparison omitted ${step.action}.`);
      assert(text.includes(normal(candidate.humanCheck)),`The comparison omitted the human check for ${candidate.title}.`);
      assert.equal(await comparison.locator('.wfc-activity[data-actor]').count()>0,true);
    } else {
      assert.equal(await flow.isVisible(),true);
      assert.equal(await flow.locator('li[data-actor]').count(),candidate.workflow.length);
      assert.equal(await flow.locator('svg.cw-flow-arrow').count(),candidate.workflow.length-1);
      const text=normal(await flow.innerText());
      for(const step of candidate.workflow)assert(text.includes(normal(step.action)),`The workflow omitted ${step.action}.`);
    }
  }
}
async function completed(result,{download=false}={}) {
  await readOnly();const book=frame.locator('#workshop-book-dialog');await book.waitFor({state:'visible'});
  assert.equal(await visibleButton('View workbook').isVisible(),false,'Completion still requires another workbook-opening click.');
  const button=visibleButton('Download PDF');assert.equal(await button.isVisible(),true);assert.equal(await button.isEnabled(),true);
  const geometry=await button.boundingBox();assert(geometry&&geometry.y+geometry.height<960,'The PDF action is not initially visible.');
  const inHost=await book.innerText();
  assert.doesNotMatch(inHost,/Cloudflare|ws1_|wr1_|revision \d+|paste (?:this|the).*reference|Would you like me to build/i);
  let text=inHost;
  const composed=book.locator('iframe[title="AMA-Groundwork: AI Use-Case Portfolio"]');
  if(await composed.isVisible())text+=' '+await frame.frameLocator('iframe[title="AMA-Groundwork: AI Use-Case Portfolio"]').locator('body').innerText();
  for(const candidate of result._meta.workbook.phases[3].answers.candidates)assert(normal(text).includes(normal(candidate.title)),`Completed workbook omitted ${candidate.title}.`);
  assert(normal(text).includes(normal(result._meta.workbook.phases[2].answers.underlyingProblem)),'The agreed underlying problem is not visible in the completed reading experience.');
  assert(normal(text).includes(normal(result._meta.workbook.group.problem)),'The original problem is not visible in the completed reading experience.');
  await visibleWorkflows(result._meta.workbook);
  await noOverflow();
  if(download){await button.click();await frame.locator('.inline-workbook[aria-busy="false"]').waitFor();assert(downloads.length>0);}
}
async function build(source,name,{recommendationOnly=false}={}) {
  const pending=await call('start_workshop');
  // Date omission is exercised separately by the contract/MCP tests. A fixed
  // fixture date keeps screenshots comparable across repeated browser runs.
  let result=await call('start_workshop',{record:pending.structuredContent.record,group:{...group,name},mode:'text'});
  const snapshots=[];
  for(let phase=1;phase<=6;phase++) {
    const content=phase===6&&recommendationOnly?{recommendation:source[5].recommendation}:source[phase-1];
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase,answers:content});
    const draft=await call('show_workbook',{record:result.structuredContent.record,phase});
    result=await call('confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`usability-${name.replace(/[^A-Za-z0-9_.:-]/g,'-')}-${phase}`});
    snapshots.push({draft,approved:result});
  }
  return {result,snapshots};
}

try {
  const prepared=await build(deferredAnswers,'Fictional 1A deferred');
  const snapshots=prepared.snapshots;
  const essentials=[
    [answers[0].outcome,answers[0].kpi,answers[0].guardrail],
    [answers[1].firstGap,...answers[1].blockers.flatMap(item=>[item.holder,item.information,item.barrier])],
    [answers[2].chosenWorkflow,answers[2].underlyingProblem,...answers[2].tasks.map(item=>item.work)],
    answers[3].candidates.flatMap(item=>[item.title,item.aiWork,item.nonAiAlternative,item.humanCheck]),
    answers[3].candidates.map(item=>item.title),
    [...answers[3].candidates.flatMap(item=>[item.title,item.aiWork]),deferredAnswers[5].recommendation],
  ];
  for(const width of [1180,600,320])for(const theme of ['light','dark']) {
    await page.setViewportSize({width,height:960});
    for(let phase=1;phase<=6;phase++) {
      await mount(snapshots[phase-1].draft,{theme,os:theme==='light'?'dark':'light'});
      await closed();await fullText(essentials[phase-1]);await noOverflow();
      if(phase===4||phase===6)await visibleWorkflows(snapshots[phase-1].draft._meta.workbook);
      metrics.push({width,theme,phase,...await frame.locator('.cw-card').evaluate(node=>({height:Math.round(node.getBoundingClientRect().height),words:node.innerText.trim().split(/\s+/).length}))});
      await screen(`${width}-${theme}-step-${phase}`);
    }
  }
  checks.push('All six draft cards preserve essential full text at 1180, 600 and 320 px in both host themes, with the opposite OS colour preference. No answer controls or horizontal overflow.');

  await page.setViewportSize({width:600,height:960});
  await mount(snapshots[5].draft);
  await emit(prepared.result);await waitRecord(prepared.result);await completed(prepared.result,{download:true});
  await screen('completion-auto-open-deferred');
  const step4=frame.locator('.cw-saved-chapter').filter({has:frame.locator('summary').filter({hasText:'Step 4:'})});
  await step4.locator('summary').first().click();
  assert.equal(await step4.locator('.cw-use-case-flow').filter({visible:true}).count(),2,'The expanded Step 4 reader must include its workflows.');
  await screen('expanded-use-case-reader-diagrams');await step4.locator('summary').first().click();
  const downloadCount=downloads.length;
  const pdfStarted=new Promise(resolve=>{markPdfStarted=resolve;});pauseNextPdf=true;
  await visibleButton('Download PDF').click();await pdfStarted;
  assert.equal(await frame.locator('.inline-workbook').getAttribute('aria-busy'),'true');
  await emit(prepared.result);await waitRecord(prepared.result);
  await emit(snapshots[5].draft);await waitRecord(prepared.result);
  assert.equal(await frame.locator('.inline-workbook').getAttribute('aria-busy'),'true','A duplicate or stale notification cancelled PDF preparation.');
  releasePdf();releasePdf=undefined;
  await frame.locator('.inline-workbook[aria-busy="false"]').waitFor();
  assert.equal(downloads.length,downloadCount+1,'The pending PDF did not reach the host download request after duplicate/stale events.');
  checks.push('Visible workflow diagrams retain every proposed action and human/AI role in Step 4, the expanded reader and all completion variants. Duplicate and stale notifications during delayed PDF preparation do not cancel delivery.');
  await closeBook();await fullText(essentials[5]);await screen('completion-manually-closed');
  await emit(prepared.result);await waitRecord(prepared.result);await closed();
  await emit(snapshots[5].draft);await waitRecord(prepared.result);await closed();
  const ordinary=structuredClone(prepared.result);ordinary.structuredContent.view.display=false;
  await emit(ordinary);await closed();
  const mismatch=structuredClone(prepared.result);mismatch.structuredContent.record.revision++;
  await emit(mismatch);await waitRecord(prepared.result);await closed();
  await screen('manual-close-survives-duplicate-stale-mismatch');
  await visibleButton('View workbook').click();await completed(prepared.result);await frame.locator('#workshop-book-dialog').press('Escape');await closed();
  await mount(prepared.result);await completed(prepared.result);
  checks.push('Completion opens the workbook automatically with an immediately visible PDF action. Manual Close and Escape restore focus; duplicate, stale, nonvisual and mismatched replies do not reopen or replace the closed final snapshot. A fresh mount opens the complete workbook.');

  // Reordered metadata for the same snapshot must not erase knowledge of a
  // newer saved revision. These are synthetic host notifications, not writes.
  const historical=structuredClone(prepared.result);
  historical.structuredContent.currentRevision=prepared.result._meta.workbook.revision+1;
  historical.structuredContent.view.historical=true;
  const reordered=structuredClone(prepared.result);
  reordered.structuredContent.currentRevision=prepared.result._meta.workbook.revision;
  reordered.structuredContent.view.historical=false;
  await mount(historical);await closed();
  assert.equal(await frame.getByText('Earlier saved view',{exact:true}).isVisible(),true);
  await emit(reordered);await waitRecord(historical);await closed();
  assert.equal(await frame.getByText('Earlier saved view',{exact:true}).isVisible(),true,'A delayed same-revision reply erased the historical label.');
  await screen('historical-metadata-reorder-stays-closed');
  await mount(prepared.result);await completed(prepared.result);await closeBook();
  await emit(historical);await waitRecord(historical);await closed();
  await emit(reordered);await waitRecord(historical);await closed();
  assert.equal(await frame.getByText('Earlier saved view',{exact:true}).isVisible(),true,'Historical metadata downgrade lost the label after manual Close.');
  await screen('historical-metadata-reorder-after-manual-close');
  checks.push('A completed revision 12 known to be historical to revision 13 remains closed and labelled Earlier saved view when delayed metadata reports current revision 12 and historical false. Manual Close remains respected through the same reordered notifications.');

  for(const [name,source,options] of [['proposed-test',answers,{}],['rejected',rejectedAnswers,{}],['recommendation-only',deferredAnswers,{recommendationOnly:true}]]) {
    const built=await build(source,`Fictional ${name}`,options);
    for(const theme of ['light','dark']) {
      await page.setViewportSize({width:320,height:960});await mount(built.result,{theme,os:theme==='light'?'dark':'light'});await completed(built.result);await screen(`complete-${name}-${theme}`);
    }
    assert.equal(built.result.structuredContent.nextQuestion.question,null);
    assert.equal(built.result.structuredContent.nextQuestion.kind,'complete');
    assert.notEqual(built.result.structuredContent.questionTurn.hostAction,'ask_one_in_host');
  }
  checks.push('Proposed-test, rejected and recommendation-only endings retain both named cases and their agreed problem. Each opens the workbook and exposes Download PDF at 320 px without a new question.');

  const long=structuredClone(deferredAnswers);
  long[3].candidates[0].title='Clarify the agreed checkpoint update while preserving employee correction and team autonomy';
  long[3].candidates[0].aiWork='Ask for the missing progress, next action or blocker only once. कर्मचारी अपना अपडेट जाँच सकते हैं। '+('Detailed updates should remain readable without hiding part of the group’s answer. '.repeat(7))+'SourceIdentifier'+('x'.repeat(180));
  long[3].candidates[0].humanCheck='The employee must be able to read the entire proposed update, correct its meaning and approve what is shared with the manager. '+('Keep the full agreed human check visible. '.repeat(8));
  const longBuilt=await build(long,'Fictional long text');
  for(const theme of ['light','dark']) {
    await page.setViewportSize({width:320,height:960});await mount(longBuilt.snapshots[3].draft,{theme,os:theme==='light'?'dark':'light'});
    await fullText([long[3].candidates[0].title,long[3].candidates[0].aiWork,long[3].candidates[0].humanCheck]);await noOverflow();await screen(`long-unicode-unbroken-${theme}`);
  }
  checks.push('Long titles and descriptions, Hindi text and an unbroken source identifier wrap without truncation at 320 px.');
  assert.equal(requests.filter(request=>request.method==='ui/update-model-context').length,0);
  assert(requests.filter(request=>request.method==='tools/call').every(request=>request.tool==='download_workbook_file'));
  assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
}catch(error){failure=error;console.error(error.stack);try{await screen('failure');}catch{}}
finally {
  releasePdf?.();
  await writeFile(new URL('evidence.json',out),JSON.stringify({result:failure?'fail':'pass',createdAt:new Date().toISOString(),widget:{bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')},checks,screenshots,metrics,requests,downloads,errors,network,failure:failure?.message,boundary:'Controlled Chromium, in-memory MCP transport and disposable local SQLite only. All group case details are synthetic. PDF delivery uses explicit stub bytes. This does not prove actual PDF rendering, Cloudflare deployment, Claude/ChatGPT behaviour, participant comprehension or native host delivery.'},null,2));
  await browser.close();await client.close();await server.close();db.close();
}
if(failure)process.exitCode=1;else console.log(`Usability browser checks passed: ${new URL('evidence.json',out).pathname}`);
