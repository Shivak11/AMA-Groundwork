import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {group, answers} from '../examples/hiring.mjs';

// This harness exercises the bundled view and actual local MCP tools. It does
// not impersonate Claude's question tool or claim native-host/model proof.
const html = await readFile(new URL('../dist/widget.html', import.meta.url), 'utf8');
const out = new URL('../output/chat-workbook/', import.meta.url);
const screens = new URL('screens/', out);
await mkdir(screens, {recursive:true});
const pdfStub = Buffer.from('%PDF-explicit-protocol-stub-not-a-rendered-document');
const renderedRecords = [];
const server = await createWorkshopServer({pdfRenderer:async record=>{renderedRecords.push(structuredClone(record));return pdfStub;}});
const client = new Client({name:'read-only-workbook-browser-check', version:'1'}, {
  capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}},
});
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
const browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
const page = await browser.newPage({viewport:{width:1180,height:1000}, reducedMotion:'reduce'});
page.setDefaultTimeout(10000);
const checks = [], modelCalls = [], viewRequests = [], fileCalls = [], downloads = [], messages = [], errors = [], screenshots = [], contextDiagnostics = [];
const networkAttempts = [];
const harnessUrl = 'https://workshop-harness.test/';
let fulfilledHarnessDocuments = 0;
page.on('pageerror', error=>errors.push(error.message));
await page.route(/^(https?|wss?):/, route=>{
  if(route.request().url()===harnessUrl && route.request().isNavigationRequest() && route.request().frame()===page.mainFrame()) {
    fulfilledHarnessDocuments++;
    return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
  }
  networkAttempts.push(route.request().url());return route.abort();
});
// This test-only document is fulfilled locally, without a socket or certificate
// override. Its HTTPS origin supplies the same secure-context prerequisite as
// supported chat hosts. The workbook remains in its original opaque sandbox.
await page.goto(harnessUrl,{waitUntil:'domcontentloaded'});
let frame, expectedDownloadRecord, rejectDownload = false, rejectMessage = false, failure, failureLayout;
const visuals = ['goal','blockers','workflow','candidates','priorities','test'];
const visualTools = new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
const chapterMarkers = [answers[0].outcome,answers[1].firstGap,answers[2].chosenWorkflow,answers[3].candidates[0].title,answers[4].challenge,answers[5].recommendation];
const body = () => frame.locator('body');
const flush = () => body().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function call(name, args) {
  const result = await client.callTool({name, arguments:args});
  assert(!result.isError, result.content?.[0]?.text);
  assert.equal(result._meta?.bookHtml,undefined);
  assert.equal(result._meta?.artifacts?.pdf,undefined);
  assert.equal(result.structuredContent.bookPreview.status,'client-rendered');
  assert(!result.content.some(item=>item.type==='resource'),'Normal calls must not cause file materialisation.');
  assert.equal(result.structuredContent.view.display,visualTools.has(name));
  const ordinary=result.content.filter(item=>item.type==='text'&&item.text.trim().startsWith('{')).map(item=>JSON.parse(item.text));
  assert.equal(ordinary.length,1);assert.deepEqual(ordinary[0],result.structuredContent);
  modelCalls.push({name,revision:result.structuredContent?.record?.revision,phase:args.phase});
  return result;
}
await page.exposeFunction('workbookHostRequest', async request=>{
  viewRequests.push({method:request.method,params:request.params});
  if(request.method==='ui/update-model-context') {
    throw new Error(`Read-only workbook attempted ${request.method}`);
  }
  if(request.method==='tools/call') {
    assert.equal(request.params.name,'download_workbook_file','The view may call only the read-only file tool.');
    assert.deepEqual(request.params.arguments.record,expectedDownloadRecord,'A file request must use its displayed snapshot, not an invented or stale replacement.');
    const before=structuredClone(request.params.arguments.record);
    const result=await client.callTool({name:request.params.name,arguments:request.params.arguments});
    assert(!result.isError,result.content?.[0]?.text);
    assert.deepEqual(request.params.arguments.record,before);
    assert.deepEqual(renderedRecords.at(-1),before);
    const resources=result.content.filter(item=>item.type==='resource');
    assert.equal(resources.length,1);assert.equal(resources[0].resource.mimeType,'application/gzip');
    assert.deepEqual(gunzipSync(Buffer.from(resources[0].resource.blob,'base64')),pdfStub);
    assert.equal(result.structuredContent.export.revision,before.revision);
    assert.equal(result.structuredContent.export.sha256,createHash('sha256').update(pdfStub).digest('hex'));
    assert.equal(result._meta?.artifacts?.pdf,undefined);assert.equal(result._meta?.bookHtml,undefined);
    assert.equal(result.structuredContent.record,undefined);
    fileCalls.push({name:request.params.name,revision:before.revision,bytes:pdfStub.length,sha256:result.structuredContent.export.sha256});
    return result;
  }
  if(request.method==='ui/download-file') {
    downloads.push(request.params);
    return rejectDownload ? {isError:true} : {};
  }
  if(request.method==='ui/message') {
    messages.push(request.params);
    return rejectMessage ? {isError:true} : {};
  }
  throw new Error(`Unexpected workbook request: ${request.method}`);
});
async function mount(initial, {downloadFile=true,message=true,theme='light',osColourScheme='light',expectDisplay=true,deliverInitial=true}={}) {
  rejectDownload=false; rejectMessage=false;
  await page.emulateMedia({colorScheme:osColourScheme});
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe id="workbook-host-frame" title="Controlled MCP workbook host" sandbox="allow-scripts" style="display:block;border:0;width:100%;height:1000px"></iframe></body></html>');
  await page.evaluate(({html,initial,downloadFile,message,theme,deliverInitial})=>{
    if(window.workbookListener)window.removeEventListener('message',window.workbookListener);
    window.workbookHostInitialised=false;
    window.workbookListener=async event=>{
      const hostFrame=document.getElementById('workbook-host-frame');
      if(event.source!==hostFrame?.contentWindow)return;
      const request=event.data;if(request?.jsonrpc!=='2.0')return;
      const reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      try {
        if(request.method==='ui/initialize')reply({
          protocolVersion:request.params.protocolVersion,
          hostInfo:{name:'Controlled read-only workbook host',version:'1'},
          // Advertise write capabilities so zero writes is proved by behaviour,
          // not by hiding those capabilities from a regressed implementation.
          hostCapabilities:{serverTools:{},updateModelContext:{},...(downloadFile?{downloadFile:{}}:{}),...(message?{message:{text:{}}}:{})},
          hostContext:{theme,displayMode:'inline'},
        });
        else if(request.method==='ui/notifications/initialized') {
          if(deliverInitial)event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial},'*');
          window.workbookHostInitialised=true;
        }
        else if(request.method==='ui/notifications/size-changed')hostFrame.style.height=`${Math.min(Math.max(Number(request.params.height)||1000,300),20000)}px`;
        else if(request.id!==undefined)reply(await window.workbookHostRequest(request));
      } catch(error) {
        event.source.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}},'*');
      }
    };
    window.addEventListener('message',window.workbookListener);
    document.getElementById('workbook-host-frame').srcdoc=html;
  },{html,initial,downloadFile,message,theme,deliverInitial});
  frame=page.frameLocator('#workbook-host-frame');
  await page.waitForFunction(()=>window.workbookHostInitialised===true);
  if(expectDisplay) {
    await frame.locator('.inline-workbook').waitFor();
    await waitRecord(initial.structuredContent.record);
  } else {
    expectedDownloadRecord=undefined;
    await assertSuppressed();
  }
  await flush();
  const actual=await body().evaluate(()=>({secureContext:isSecureContext,webCryptoAvailable:Boolean(globalThis.crypto?.subtle),gzipAvailable:typeof DecompressionStream==='function',hostDark:document.documentElement.classList.contains('dark'),osDark:matchMedia('(prefers-color-scheme: dark)').matches,background:getComputedStyle(document.body).backgroundColor,text:getComputedStyle(document.body).color}));
  contextDiagnostics.push({origin:harnessUrl,requestedHostTheme:theme,requestedOsColourScheme:osColourScheme,...actual});
  assert.equal(actual.secureContext,true);assert.equal(actual.webCryptoAvailable,true);assert.equal(actual.gzipAvailable,true);
  assert.equal(actual.hostDark,theme==='dark');assert.equal(actual.osDark,osColourScheme==='dark');
}
async function emit(result) {
  await page.evaluate(params=>document.getElementById('workbook-host-frame').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params},'*'),result);
  await flush();
}
async function assertSuppressed() {
  await flush();
  // Let the connection completion callback and subsequent paints run. A routine
  // result must stay empty rather than briefly clearing then showing a scaffold.
  await frame.locator('#workshop-root').evaluate(node=>new Promise((resolve,reject)=>{
    const start=performance.now();
    const check=()=>{
      if(node.childElementCount || node.textContent.trim())return reject(new Error('A routine response mounted a workbook or waiting scaffold.'));
      if(performance.now()-start>=250)return resolve();
      requestAnimationFrame(check);
    };requestAnimationFrame(check);
  }));
  assert.equal(await frame.locator('h1,h2,h3,h4,h5,h6,.inline-workbook,button').count(),0);
}
async function waitRecord(record) {
  await frame.getByLabel('Complete JSON record',{exact:true}).waitFor({state:'attached'});
  await frame.getByLabel('Complete JSON record',{exact:true}).evaluate((node,expected)=>new Promise((resolve,reject)=>{
    const start=Date.now();
    const poll=()=>{
      const saved=document.querySelector('[aria-label="Complete JSON record"]');
      if(saved && JSON.stringify(JSON.parse(saved.textContent))===expected)return resolve();
      if(Date.now()-start>8000)return reject(new Error('Expected complete snapshot record was not shown'));
      requestAnimationFrame(poll);
    };poll();
  }),JSON.stringify(record));
  expectedDownloadRecord=structuredClone(record);
}
async function assertReadOnly() {
  assert.equal(await frame.locator('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="checkbox"], [role="radio"], [role="slider"]').count(),0);
  const allowed=new Set(['Open workbook','Close workbook','Download PDF','Download saved record','Request current file links']);
  const buttons=await frame.getByRole('button',{includeHidden:true}).allTextContents();
  for(const text of buttons)assert(allowed.has(text.trim()) || text.includes('Open workbook'),`Unexpected interactive control: ${text}`);
  assert(viewRequests.filter(r=>r.method==='tools/call').every(r=>r.params?.name==='download_workbook_file'));
  assert.equal(viewRequests.filter(r=>r.method==='ui/update-model-context').length,0);
}
async function assertNoOverflow() {
  const measure=await body().evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(measure.page<=measure.viewport+1 && measure.body<=measure.viewport+1,`Horizontal overflow: ${JSON.stringify(measure)}`);
}
async function screenshot(name) {
  await flush();
  const path=new URL(`${name}.png`,screens).pathname;
  await page.screenshot({path,fullPage:true});screenshots.push(path);
}
async function openBook() {
  const opener=frame.getByRole('button',{name:'Open workbook',exact:true}).filter({visible:true}).first();
  await opener.click();
  await frame.locator('#workshop-book-dialog').waitFor({state:'visible'});
  const book=frame.frameLocator('iframe[title="AMA-Groundwork: AI Use-Case Portfolio"]');
  await book.locator('body').waitFor();
  await book.getByText('Prepared by Dr. Shiva Kakkar',{exact:false}).first().waitFor();
  assert((await book.locator('body').textContent()).includes('Prepared by Dr. Shiva Kakkar'));
  assert.equal(await book.locator('input, textarea, select, [contenteditable]').count(),0);
  return book;
}
async function closeBook() {
  await frame.getByRole('button',{name:'Close workbook',exact:true}).click();
  await frame.locator('#workshop-book-dialog').waitFor({state:'hidden'});
  await flush();
}
async function waitIdle() {
  await frame.locator('.inline-workbook[aria-busy="false"]').waitFor();
  await flush();
}
function assertFileMessage(message) {
  const text=(message.content??[]).map(item=>item.text??'').join('\n');
  assert.equal(message.role,'user');
  assert(text.length<350,'File request exposed an internal handoff prompt');
  assert.match(text,/latest.*workbook PDF/i);
  assert.match(text,/do not restart the workshop questions/i);
  assert(!text.includes(group.name));
  assert(!text.includes(answers[0].outcome));
  assert(!/schemaVersion|record revision|questionTurn|phaseId|"phases"|owner\s*=|Return to activity/i.test(text));
  assert.equal(Object.hasOwn(message,'structuredContent'),false);
}
try {
  let result=await call('start_workshop',{group});
  await mount(null,{expectDisplay:false,deliverInitial:false});
  assert.equal(viewRequests.length,0);await screenshot('handshake-without-result-suppressed');
  const firstRequested=await call('show_workbook',{record:result.structuredContent.record,phase:1});
  await emit(firstRequested);await waitRecord(firstRequested.structuredContent.record);
  assert.equal(await frame.locator('.inline-workbook').count(),1);
  await assertReadOnly();await screenshot('explicit-workbook-after-no-result');
  checks.push('A host handshake with no tool result leaves the view entirely empty after connection completion. A later actual show_workbook response renders the requested snapshot without inventing answers or approval.');
  const bareErrors=[];
  for(const request of [
    {name:'save_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,answers:{kpi:42}}},
    {name:'confirm_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,approved:false,confirmation:'No approval was given.'}},
    {name:'workshop_next',arguments:{record:{schemaVersion:1}}},
  ]) {
    const rejected=await client.callTool(request);
    assert.equal(rejected.isError,true);assert.equal(rejected.structuredContent,undefined);
    assert(rejected.content.some(item=>item.type==='text'&&item.text.length));
    assert(!rejected.content.some(item=>item.type==='resource'));
    bareErrors.push(rejected);
    await mount(rejected,{expectDisplay:false});
    assert.equal(viewRequests.length,0);
  }
  await screenshot('bare-error-suppressed');
  checks.push('Actual SDK type/refusal rejections and a malformed-record fallback have isError without structured display metadata. Freshly mounted views receiving each bare error stay empty after the handshake, with no scaffold, headings, controls or host requests.');
  await mount(result,{expectDisplay:false});
  assert.equal(viewRequests.length,0);await screenshot('routine-start-suppressed');
  const routineError=await client.callTool({name:'save_workshop_phase',arguments:{record:result.structuredContent.record,phase:1,answers:{}}});
  assert.equal(routineError.isError,true);assert.equal(routineError.structuredContent.view.display,false);
  assert(!routineError.content.some(item=>item.type==='resource'));
  await emit(routineError);await assertSuppressed();
  checks.push('A newly mounted routine start remains empty after the real host handshake and connection completion, without a heading, waiting scaffold, controls or file attachment. A suppressed error also leaves it empty; canonical records and errors remain in ordinary model text.');
  const snapshots=[];
  for(let phase=1;phase<=6;phase++) {
    const previouslyDisplayed=expectedDownloadRecord?structuredClone(expectedDownloadRecord):null;
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase,answers:answers[phase-1]});
    await emit(result);
    if(previouslyDisplayed)await waitRecord(previouslyDisplayed);else await assertSuppressed();
    const draft=await call('show_workbook',{record:result.structuredContent.record,phase});
    await emit(draft);await waitRecord(draft.structuredContent.record);
    if(phase===1) {
      const savedText=await body().innerText();await emit(routineError);
      await waitRecord(draft.structuredContent.record);assert.equal(await body().innerText(),savedText);
      for(const rejected of bareErrors) {
        await emit(rejected);await waitRecord(draft.structuredContent.record);
        assert.equal(await body().innerText(),savedText,'A bare error must not replace the snapshot or add an error scaffold.');
      }
      await screenshot('bare-errors-retain-snapshot');
    }
    assert.equal(await frame.locator('.inline-workbook').getAttribute('data-phase'),String(phase));
    await frame.locator(`.cw-main > .cw-phase [data-visual="${visuals[phase-1]}"]`).waitFor();
    await assertReadOnly();await assertNoOverflow();await screenshot(`step-${phase}-saved`);
    result=await call('confirm_workshop_phase',{record:draft.structuredContent.record,phase,approved:true,confirmation:`The fictional group approves its saved Step ${phase} summary.`});
    assert.equal(result.structuredContent.record.phases[phase-1].status,'confirmed');
    assert.equal(result.structuredContent.export.status,'ready');
    assert.equal(result.structuredContent.export.downloadTool,'download_workbook_file');
    assert.equal(renderedRecords.length,phase,'Each explicit confirmation invokes the PDF renderer.');
    assert.deepEqual(renderedRecords.at(-1),result.structuredContent.record);
    await emit(result);await waitRecord(result.structuredContent.record);
    assert((await frame.locator('.cw-progress').innerText()).includes(`${phase} of 6 steps approved`));
    const phaseBook=await openBook();const bookText=await phaseBook.locator('body').textContent();
    for(const marker of chapterMarkers.slice(0,phase))assert(bookText.includes(marker),`Locally composed Step ${phase} book omitted saved wording: ${marker}`);
    await closeBook();
    await screenshot(`step-${phase}-approved`);
    snapshots.push(result);
  }
  checks.push('An explicit show_workbook result renders after a suppressed start. Later routine saves leave the previous visible record unchanged until an intended visual result arrives. Suppressed errors do not replace the saved view or add an error scaffold.');
  checks.push('The three actual bare errors also leave an already displayed workbook byte-for-byte unchanged in its visible text and preserve its complete saved record.');
  checks.push('All six visuals use actual saved MCP records. Six explicit confirmations invoke the PDF renderer and return manifests without PDF bytes or book HTML. The widget composes each cumulative book from its snapshot and bundled assets; the opened book retains every approved chapter marker.');
  const completed=snapshots[5];
  const book=await openBook();
  assert((await book.locator('body').textContent()).includes(answers[5].recommendation));
  await screenshot('complete-book');await assertReadOnly();await closeBook();
  await openBook();await closeBook();await waitRecord(completed.structuredContent.record);
  checks.push('Opening and reopening the locally composed book preserves every answer and emits no tool calls or context updates.');

  await emit(snapshots[0]);await waitRecord(completed.structuredContent.record);
  const conflict=structuredClone(completed);
  conflict.structuredContent.record.phases[0].answers.outcome='Conflicting wording in the same revision.';
  await emit(conflict);await waitRecord(completed.structuredContent.record);
  await frame.getByText('A conflicting reply was ignored. Use the latest saved record in the conversation.',{exact:true}).waitFor();
  await assertReadOnly();await screenshot('conflicting-reply-retained');
  await emit(completed);await waitRecord(completed.structuredContent.record);
  checks.push('Older results and same-revision conflicting records cannot replace the displayed snapshot or expose reconciliation/mutation controls.');

  await frame.getByRole('button',{name:'Download PDF',exact:true}).filter({visible:true}).first().click();await waitIdle();
  assert.equal(fileCalls.length,1);assert.equal(fileCalls.at(-1).revision,completed.structuredContent.record.revision);
  assert.equal(downloads.at(-1).contents[0].resource.mimeType,'application/pdf');
  assert.equal(downloads.at(-1).contents[0].resource.blob,pdfStub.toString('base64'));
  await frame.getByRole('button',{name:'Download saved record',exact:true}).filter({visible:true}).first().click();await waitIdle();
  assert.deepEqual(JSON.parse(downloads.at(-1).contents[0].resource.text),completed.structuredContent.record);
  rejectDownload=true;
  await frame.getByRole('button',{name:'Download PDF',exact:true}).filter({visible:true}).first().click();await waitIdle();
  assert.equal(fileCalls.length,2);
  await frame.getByText('The download was declined. Ask for normal file links in the conversation.',{exact:true}).waitFor();
  await waitRecord(completed.structuredContent.record);await assertReadOnly();
  checks.push('PDF download calls the actual read-only file tool, decompresses its single gzip resource and passes byte-identical PDF stub content to the native download request. JSON downloads retain the full snapshot. A declined download retains the complete record. No real host download or rendered PDF is claimed.');

  const savedOnly=await call('show_workbook',{record:completed.structuredContent.record,phase:6});
  assert.equal(savedOnly.structuredContent.export,undefined);
  await mount(savedOnly);
  assert.equal(await frame.getByRole('button',{name:'Download PDF',exact:true}).filter({visible:true}).first().isEnabled(),true);
  rejectDownload=false;
  await frame.getByRole('button',{name:'Download PDF',exact:true}).filter({visible:true}).first().click();await waitIdle();
  assert.equal(fileCalls.length,3);assert.equal(fileCalls.at(-1).revision,completed.structuredContent.record.revision);
  assert.equal(downloads.at(-1).contents[0].resource.blob,pdfStub.toString('base64'));
  await waitRecord(completed.structuredContent.record);await assertReadOnly();
  checks.push('A read-only workbook view with approved chapters can download its PDF even when no export manifest or attached file was supplied.');

  await mount(snapshots[0],{downloadFile:false});
  await frame.getByRole('button',{name:'Download PDF',exact:true}).filter({visible:true}).first().click();await waitIdle();
  assertFileMessage(messages.at(-1));
  const afterFallback=messages.length;
  await openBook();await closeBook();
  assert.equal(messages.length,afterFallback,'Reading the old book must not message the host');
  await frame.getByRole('button',{name:'Request current file links',exact:true}).click();await waitIdle();assertFileMessage(messages.at(-1));
  rejectMessage=true;
  await frame.getByRole('button',{name:'Request current file links',exact:true}).click();await waitIdle();
  await frame.getByText('The file request was not accepted. Ask for the latest PDF and JSON in the conversation.',{exact:true}).waitFor();
  await waitRecord(snapshots[0].structuredContent.record);await assertReadOnly();
  checks.push('Historical cards request current file links without sharing their record, names, answers, revision or ownership; rejected messages leave the snapshot unchanged.');

  await mount(snapshots[0],{downloadFile:false,message:false});
  const beforeUnsupported=messages.length;
  await frame.getByRole('button',{name:'Request current file links',exact:true}).click();await waitIdle();
  await frame.getByText('Ask in the conversation: “Please give us the latest workbook PDF and JSON backup.”',{exact:true}).waitFor();
  assert.equal(messages.length,beforeUnsupported);await assertReadOnly();
  checks.push('Hosts without download/message support receive a readable fallback without record writes.');

  await page.setViewportSize({width:320,height:900});
  for(let phase=1;phase<=6;phase++) {
    await mount(snapshots[phase-1],{theme:'dark',osColourScheme:'light'});
    assert.equal(await frame.locator('html').evaluate(node=>node.classList.contains('dark')),true);
    await assertNoOverflow();await assertReadOnly();await screenshot(`mobile-dark-step-${phase}`);
  }
  await mount(snapshots[5],{theme:'light',osColourScheme:'dark'});
  assert.equal(await frame.locator('html').evaluate(node=>node.classList.contains('dark')),false);
  await assertNoOverflow();await assertReadOnly();await screenshot('mobile-light-os-dark');
  checks.push('Explicit dark host theme is tested against a light OS preference for all six steps, and explicit light host theme against a dark OS preference. The opaque sandbox has real Web Crypto and gzip support under a locally fulfilled test-only HTTPS origin; external requests remain blocked.');
  const long='Unbroken'.repeat(140);
  const hostile='<img src="https://invalid.example/workbook-audit" onerror="window.workbookAuditInjected=true">';
  const longResult=await call('save_workshop_phase',{record:completed.structuredContent.record,phase:1,answers:{outcome:long,kpi:hostile}});
  const longView=await call('show_workbook',{record:longResult.structuredContent.record,phase:1});
  await mount(longView,{theme:'dark'});
  await assertNoOverflow();await assertReadOnly();
  assert.equal(await frame.locator('img[src*="invalid.example"]').count(),0);
  assert.equal(await body().evaluate(()=>Boolean(window.workbookAuditInjected)),false);
  await frame.locator('.cw-full-wording summary').click();await assertNoOverflow();
  await frame.locator('.cw-backup summary').click();await assertNoOverflow();
  await screenshot('mobile-dark-long-wording');
  await openBook();await assertNoOverflow();await screenshot('mobile-dark-book');await closeBook();
  checks.push('All six visuals fit a 320px dark host; long unbroken text, expanded wording/JSON and the open book do not overflow the outer view. HTML-like answers remain text.');
  await assertReadOnly();
  assert.deepEqual(errors,[]);assert.deepEqual(networkAttempts,[]);
} catch(error) {
  failure=error;console.error(error.stack);
  try {
    failureLayout={
      host:await page.evaluate(()=>({scrollY,innerHeight,frame:document.getElementById('workbook-host-frame')?.getBoundingClientRect().toJSON()})),
      workbook:await body().evaluate(()=>({scrollY,innerHeight,dialog:document.getElementById('workshop-book-dialog')?.getBoundingClientRect().toJSON(),closeButton:[...document.querySelectorAll('button')].find(button=>button.textContent==='Close workbook')?.getBoundingClientRect().toJSON()})),
    };
    console.error(JSON.stringify({failureLayout}));
  } catch {}
  try {await screenshot('failure');} catch {}
} finally {
  await writeFile(new URL('evidence.json',out),JSON.stringify({
    result:failure?'fail':'pass',createdAt:new Date().toISOString(),
    widget:{bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')},
    checks,modelCalls,viewRequests,fileCalls,rendererCalls:renderedRecords.length,downloads:downloads.length,fileMessages:messages,errors,networkAttempts,screenshots,contextDiagnostics,fulfilledHarnessDocuments,
    toolCallsFromView:viewRequests.filter(r=>r.method==='tools/call').length,
    recordMutatingCallsFromView:viewRequests.filter(r=>r.method==='tools/call'&&r.params?.name!=='download_workbook_file').length,
    modelContextUpdatesFromView:viewRequests.filter(r=>r.method==='ui/update-model-context').length,
    failure:failure?.message,failureLayout,
    boundary:'Actual bundled workbook in a controlled MCP Apps host, with real in-memory MCP state and file tools. The widget composes the book locally and requests only read-only snapshot files. Compressed file content is checked against an explicit PDF stub. Native question cards, Claude/ChatGPT behaviour, real file delivery, real PDF rendering and live deployment are not proved by this harness.',
  },null,2));
  await browser.close();await client.close();await server.close();
}
if(failure)process.exitCode=1;else console.log(`Read-only workbook browser checks passed. Evidence: ${new URL('evidence.json',out).pathname}`);
