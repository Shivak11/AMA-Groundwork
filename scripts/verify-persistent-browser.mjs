import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {renderWorkbookHtml} from '../src/render-workbook.mjs';
import {createD1SessionStore} from '../remote/d1-session-store.mjs';
import {persistentRoute} from '../remote/persistent-routes.mjs';
import {createSqliteD1} from '../tests/support/d1-sqlite.mjs';
import {readKeyFor} from '../src/session-store.mjs';
import {group,answers,approval,renamedGroup} from '../examples/persistent-remote-team.mjs';

// Controlled browser proof only. All requests are fulfilled locally. The MCP,
// SQLite persistence, route handlers and bundled UI are real; the PDF is an
// explicit protocol stub, not a rendered participant document or host delivery.
const out=new URL('../output/persistent-browser/',import.meta.url);
const screens=new URL('screens/',out);
await mkdir(screens,{recursive:true});
const html=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
const pdfStub=Buffer.from('%PDF-persistent-browser-protocol-stub-NOT-a-rendered-workbook');
const pdfHash=createHash('sha256').update(pdfStub).digest('hex');
const baseUrl='https://persistent-workbook-harness.test';
const harnessUrl=`${baseUrl}/controlled-host`;
const db=createSqliteD1(),store=createD1SessionStore(db);
const rendered=[];
const pdfRenderer=async record=>{rendered.push(record.revision);return pdfStub;};
const server=await createWorkshopServer({sessionStore:store,baseUrl,writesEnabled:true,pdfRenderer});
const client=new Client({name:'controlled-persistent-browser',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1180,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const checks=[],screenshots=[],errors=[],blockedNetwork=[],hostRequests=[],modelCalls=[],routeCalls=[],downloadReceipts=[],themes=[];
let expectedReference,frame,workspacePage,expectedWorkspaceUrl,failure;
const visualKinds=['goal','blockers','workflow','candidates','priorities','test'];
const chapterMarkers=[answers[0].outcome,answers[1].firstGap,answers[2].chosenWorkflow,answers[3].candidates[0].title,answers[4].challenge,answers[5].recommendation];
const visualTools=new Set(['show_workbook','show_shortlist','confirm_workshop_phase','export_workbook']);
context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
await context.route(/^(https?|wss?):/,async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==baseUrl) {blockedNetwork.push({origin:url.origin,path:url.pathname});return route.abort();}
  assert(!/w[rs]1_/.test(url.pathname+url.search),'A private access key escaped into a request URL.');
  if(url.pathname==='/controlled-host'&&request.isNavigationRequest())return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'});
  try {
    const headers=await request.allHeaders();
    if(url.pathname.startsWith('/api/'))assert.match(headers.authorization??'',/^Bearer wr1_[A-Za-z0-9_-]{43}$/);
    const response=await persistentRoute(new Request(request.url(),{method:request.method(),headers}),{store,bookRenderer:renderWorkbookHtml,pdfRenderer,baseUrl});
    if(!response) {blockedNetwork.push({origin:url.origin,path:url.pathname});return route.abort();}
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('referrer-policy'),'no-referrer');
    const body=Buffer.from(await response.arrayBuffer());
    routeCalls.push({path:url.pathname,revision:url.searchParams.get('revision'),kind:url.searchParams.get('kind'),status:response.status,bytes:body.length});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
  }catch(error) {errors.push(error.message);await route.abort();}
});
const page=await context.newPage();page.setDefaultTimeout(10000);
await page.goto(harnessUrl,{waitUntil:'domcontentloaded'});
const flush=()=>frame.locator('body').evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
async function call(name,args={}) {
  const result=await client.callTool({name,arguments:args});
  assert.notEqual(result.isError,true,result.content?.[0]?.text);
  const data=result.structuredContent;
  assert.deepEqual(Object.keys(data.record).sort(),['key','revision']);
  assert.equal(data.record.phases,undefined);assert.equal(data.record.group,undefined);
  if(result._meta?.workbook)assert.equal(result._meta.workbook.revision,data.record.revision);
  if(data.view)assert.equal(data.view.display,visualTools.has(name));
  const ordinary=result.content.filter(item=>item.type==='text'&&item.text.trim().startsWith('{')).map(item=>JSON.parse(item.text));
  assert.equal(ordinary.length,1);assert.deepEqual(ordinary[0],JSON.parse(JSON.stringify(data)));
  assert.equal(result.content.some(item=>item.type==='resource'),false);
  modelCalls.push({name,revision:data.record.revision,phase:args.phase});
  return result;
}
await page.exposeFunction('persistentHostRequest',async request=>{
  hostRequests.push({method:request.method,tool:request.params?.name});
  if(request.method==='ui/update-model-context')throw new Error('Read-only workbook wrote model context.');
  if(request.method==='tools/call') {
    assert.equal(request.params.name,'download_workbook_file');
    assert.deepEqual(request.params.arguments,{record:expectedReference});
    assert.deepEqual(Object.keys(request.params.arguments.record).sort(),['key','revision']);
    const result=await client.callTool(request.params);assert.notEqual(result.isError,true);
    const resource=result.content.find(item=>item.type==='resource')?.resource;
    assert.equal(resource?.mimeType,'application/gzip');assert.deepEqual(gunzipSync(Buffer.from(resource.blob,'base64')),pdfStub);
    assert.equal(result.structuredContent.export.revision,expectedReference.revision);
    assert.equal(result.structuredContent.export.sha256,pdfHash);
    return result;
  }
  if(request.method==='ui/download-file') {
    const resource=request.params.contents[0].resource;
    if(resource.mimeType==='application/pdf')assert.deepEqual(Buffer.from(resource.blob,'base64'),pdfStub);
    else assert.deepEqual(JSON.parse(resource.text),(await store.load(expectedReference.key,expectedReference.revision)).record);
    downloadReceipts.push({surface:'mock host request',kind:resource.mimeType,revision:expectedReference.revision,stub:resource.mimeType==='application/pdf'});
    return {};
  }
  if(request.method==='ui/open-link') {
    assert.equal(request.params.url,expectedWorkspaceUrl);
    const url=new URL(request.params.url);assert.equal(url.pathname,'/workbook');assert.equal(url.search,'');
    assert.match(url.hash,/^#wr1_[A-Za-z0-9_-]{43}$/);
    return {};
  }
  if(request.method==='ui/message') {
    const text=request.params.content.map(item=>item.text??'').join('\n');
    assert(text.includes(JSON.stringify(expectedReference)));assert(!text.includes('schemaVersion'));
    return {};
  }
  throw new Error(`Unexpected read-only view request: ${request.method}`);
});
async function waitRecord(result) {
  const record=result._meta.workbook;
  await frame.getByLabel('Complete JSON record',{exact:true}).waitFor({state:'attached'});
  await frame.getByLabel('Complete JSON record',{exact:true}).evaluate((node,expected)=>new Promise((resolve,reject)=>{
    const start=performance.now();const poll=()=>{
      const actual=document.querySelector('[aria-label="Complete JSON record"]');
      if(actual&&JSON.stringify(JSON.parse(actual.textContent))===expected)return resolve();
      if(performance.now()-start>8000)return reject(new Error('The expected canonical snapshot is not displayed.'));
      requestAnimationFrame(poll);
    };poll();
  }),JSON.stringify(record));
  expectedReference=structuredClone(result.structuredContent.record);expectedWorkspaceUrl=result.structuredContent.workspace.url;
}
async function mount(initial,{theme='light',os='light'}={}) {
  await page.emulateMedia({colorScheme:os});
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe id="controlled-workbook" title="Controlled persistent MCP host" sandbox="allow-scripts" style="display:block;border:0;width:100%;height:1000px"></iframe></body></html>');
  await page.evaluate(({html,initial,theme})=>{
    if(window.persistentListener)removeEventListener('message',window.persistentListener);
    window.persistentReady=false;
    window.persistentListener=async event=>{
      const iframe=document.getElementById('controlled-workbook');if(event.source!==iframe?.contentWindow)return;
      const request=event.data;if(request?.jsonrpc!=='2.0')return;
      const reply=result=>event.source.postMessage({jsonrpc:'2.0',id:request.id,result},'*');
      try {
        if(request.method==='ui/initialize')reply({protocolVersion:request.params.protocolVersion,hostInfo:{name:'Controlled persistent host',version:'1'},hostCapabilities:{serverTools:{},updateModelContext:{},downloadFile:{},openLinks:{},message:{text:{}}},hostContext:{theme,displayMode:'inline'}});
        else if(request.method==='ui/notifications/initialized') {event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:initial},'*');window.persistentReady=true;}
        else if(request.method==='ui/notifications/size-changed')iframe.style.height=`${Math.min(20000,Math.max(300,Number(request.params.height)||1000))}px`;
        else if(request.id!==undefined)reply(await window.persistentHostRequest(request));
      }catch(error){event.source.postMessage({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:error.message}},'*');}
    };
    addEventListener('message',window.persistentListener);document.getElementById('controlled-workbook').srcdoc=html;
  },{html,initial,theme});
  frame=page.frameLocator('#controlled-workbook');await page.waitForFunction(()=>window.persistentReady);
  await waitRecord(initial);await flush();
  const actual=await frame.locator('body').evaluate(()=>({secure:isSecureContext,crypto:Boolean(crypto?.subtle),hostDark:document.documentElement.classList.contains('dark'),osDark:matchMedia('(prefers-color-scheme:dark)').matches}));
  assert.equal(actual.secure,true);assert.equal(actual.crypto,true);assert.equal(actual.hostDark,theme==='dark');assert.equal(actual.osDark,os==='dark');themes.push({surface:'widget',theme,os,...actual});
}
async function emit(result) {
  await page.evaluate(result=>document.getElementById('controlled-workbook').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*'),result);
  await flush();
}
async function readOnly() {
  assert.equal(await frame.locator('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="checkbox"],[role="radio"],[role="slider"]').count(),0);
  const allowed=new Set(['Open workbook','Close workbook','Download PDF','Download saved record','Request current file links','Open the latest saved workbook']);
  const labels=await frame.getByRole('button',{includeHidden:true}).evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')??button.textContent));
  for(const label of labels)assert(allowed.has(label.trim()),`Unexpected control: ${label}`);
  assert.equal(hostRequests.filter(item=>item.method==='ui/update-model-context').length,0);
  assert(hostRequests.filter(item=>item.method==='tools/call').every(item=>item.tool==='download_workbook_file'));
}
async function noOverflow(target=frame.locator('body')) {
  const size=await target.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(size.page<=size.viewport+1&&size.body<=size.viewport+1,`Horizontal overflow: ${JSON.stringify(size)}`);
}
async function screen(name,target=page) {const file=new URL(`${name}.png`,screens);await target.screenshot({path:file.pathname,fullPage:true});screenshots.push(`screens/${name}.png`);}
async function idle(){await frame.locator('.inline-workbook[aria-busy="false"]').waitFor();await flush();}
const visibleButton=name=>frame.getByRole('button',{name,exact:true}).filter({visible:true}).first();
async function openBook() {
  await visibleButton('Open workbook').click();await frame.locator('#workshop-book-dialog').waitFor({state:'visible'});
  const book=frame.frameLocator('iframe[title="Composed workshop workbook"]');await book.locator('body').waitFor();
  assert.equal(await book.locator('input,textarea,select,[contenteditable]').count(),0);return book;
}
async function closeBook(){await visibleButton('Close workbook').click();await frame.locator('#workshop-book-dialog').waitFor({state:'hidden'});await flush();}

try {
  const prepared=await call('start_workshop');assert.equal(prepared.structuredContent.pending,true);
  let result=await call('start_workshop',{record:prepared.structuredContent.record,group,mode:'text'});
  const snapshots=[];
  for(let phase=1;phase<=6;phase++) {
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase,answers:answers[phase-1]});
    const draft=await call('show_workbook',{record:result.structuredContent.record,phase});
    await mount(draft);await frame.locator(`.cw-main > .cw-phase [data-visual="${visualKinds[phase-1]}"]`).waitFor();
    await readOnly();await noOverflow();await screen(`step-${phase}-saved`);
    result=await call('confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`browser-approve-${phase}`});
    assert.equal(result._meta.workbook.phases[phase-1].status,'confirmed');assert.equal(result.structuredContent.export.status,'ready');
    await emit(result);await waitRecord(result);
    assert((await frame.locator('.cw-progress').innerText()).includes(`${phase} of 6 steps approved`));
    const book=await openBook();const text=await book.locator('body').textContent();
    for(const marker of chapterMarkers.slice(0,phase))assert(text.includes(marker));
    await closeBook();await screen(`step-${phase}-approved`);snapshots.push(result);
  }
  checks.push('Six real SQLite-backed phases render six distinct read-only visuals. Short model references and full _meta.workbook snapshots stay aligned; each cumulative book includes all approved chapter wording.');
  const complete=snapshots[5];
  await openBook();await screen('complete-book');await closeBook();
  const rename=await call('save_workshop_phase',{record:complete.structuredContent.record,phase:6,group:renamedGroup});
  const renamed=await call('show_workbook',{record:rename.structuredContent.record,phase:6});
  assert.equal(renamed.structuredContent.record.key,complete.structuredContent.record.key);
  await emit(renamed);await waitRecord(renamed);
  assert.equal(await frame.locator('.cw-group-identity').textContent(),renamedGroup.name);await screen('group-name-correction');
  const otherPrepared=await call('start_workshop'),other=await call('start_workshop',{record:otherPrepared.structuredContent.record,group:{...group,name:'Separate fictional group'}});
  const otherView=await call('show_workbook',{record:other.structuredContent.record,phase:1});
  await emit(otherView);await waitRecord(renamed);
  await frame.getByText('This reply belongs to a different workbook. The existing snapshot is retained.',{exact:true}).waitFor();
  await readOnly();await screen('foreign-workbook-rejected');
  await emit(renamed);await waitRecord(renamed);
  checks.push('A same-key group-name correction is accepted; a genuine second session is rejected and cannot replace the first snapshot.');
  await visibleButton('Download PDF').click();await idle();
  await visibleButton('Download saved record').click();await idle();
  assert.equal(downloadReceipts.filter(item=>item.surface==='mock host request').length,2);
  await visibleButton('Open the latest saved workbook').click();await idle();
  assert.equal(hostRequests.filter(item=>item.method==='ui/open-link').length,1);
  await visibleButton('Request current file links').click();await idle();
  checks.push('The widget file tool uses only the short snapshot reference. PDF stub bytes and full JSON reach mocked native-download requests; the reading link uses ui/open-link and carries only a read key in its fragment. No model-context or record-changing calls originate in the view.');
  for(const theme of ['light','dark']) {
    await page.setViewportSize({width:320,height:900});
    for(let phase=1;phase<=6;phase++) {
      await mount(snapshots[phase-1],{theme,os:theme==='light'?'dark':'light'});
      await readOnly();await noOverflow();await screen(`mobile-${theme}-step-${phase}`);
    }
  }
  checks.push('All six saved visuals fit 320 px in light and dark host themes against the opposite OS preference, without answer controls.');
  workspacePage=await context.newPage();workspacePage.setDefaultTimeout(10000);
  await workspacePage.setViewportSize({width:1180,height:1000});
  const readingUrl=renamed.structuredContent.workspace.url;
  assert.equal(new URL(readingUrl).hash.slice(1),await readKeyFor(renamed.structuredContent.record.key));
  await workspacePage.goto(readingUrl,{waitUntil:'domcontentloaded'});
  await workspacePage.locator('#book:not([hidden])').waitFor();
  await workspacePage.getByText(`${renamedGroup.name} · 6 of 6 steps approved in revision ${renamed._meta.workbook.revision}. This is the latest saved version.`,{exact:true}).waitFor();
  assert.equal(await workspacePage.locator('#book').getAttribute('sandbox'),'');
  const workspaceBook=workspacePage.frameLocator('#book');
  assert((await workspaceBook.locator('body').innerText()).includes(answers[5].recommendation));
  assert.equal(await workspacePage.locator('input,textarea,[contenteditable]').count(),0);
  assert.equal(await workspaceBook.locator('input,textarea,select,[contenteditable]').count(),0);
  await screen('workspace-latest',workspacePage);
  const oldRevision=snapshots[0]._meta.workbook.revision;
  await workspacePage.getByLabel('Saved version',{exact:true}).selectOption(String(oldRevision));
  await workspacePage.locator('#status').filter({hasText:`revision ${oldRevision}. Latest saved version:`}).waitFor();
  assert((await workspaceBook.locator('body').innerText()).includes(answers[0].outcome));
  assert(!(await workspaceBook.locator('body').innerText()).includes(answers[5].recommendation));
  await screen('workspace-historical',workspacePage);
  await workspacePage.getByRole('button',{name:'Load latest',exact:true}).click();
  await workspacePage.locator('#status').filter({hasText:'This is the latest saved version.'}).waitFor();
  for(const theme of ['light','dark']) {
    await workspacePage.setViewportSize({width:320,height:900});await workspacePage.emulateMedia({colorScheme:theme});
    await noOverflow(workspacePage.locator('body'));
    const colour=await workspacePage.locator('body').evaluate(node=>getComputedStyle(node).backgroundColor);
    assert.equal(colour,theme==='dark'?'rgb(33, 33, 31)':'rgb(250, 249, 246)');themes.push({surface:'workspace',theme,background:colour});
    await screen(`workspace-mobile-${theme}`,workspacePage);
  }
  checks.push('The actual private workspace route renders real composed HTML, latest and historical versions, a sandboxed book and 320 px light/dark layouts. Read keys travel only in same-origin authorisation headers, never URL paths or queries.');
  db.sqlite.exec('UPDATE workshop_storage_budget SET limit_bytes=used_bytes WHERE id=1');
  await assert.rejects(store.createFileTicket(renamed.structuredContent.record.key,renamed._meta.workbook.revision,'json'),error=>error.code==='LIMIT');
  const beforeBudget=db.sqlite.prepare('SELECT used_bytes FROM workshop_storage_budget').get().used_bytes;
  const beforeTickets=db.sqlite.prepare('SELECT count(*) AS n FROM workshop_file_tickets').get().n;
  for(const kind of ['pdf','json']) {
    await workspacePage.getByRole('button',{name:kind==='pdf'?'Prepare PDF':'Prepare saved record',exact:true}).click();
    const link=workspacePage.getByRole('link',{name:kind==='pdf'?'Download PDF':'Download saved record',exact:true});await link.waitFor();
    const [download]=await Promise.all([workspacePage.waitForEvent('download'),link.click()]);
    const expectedName=`our-ai-use-case-portfolio-r${renamed._meta.workbook.revision}.${kind}`;assert.equal(download.suggestedFilename(),expectedName);
    const destination=new URL(`controlled-${expectedName}`,out);await download.saveAs(destination.pathname);
    const bytes=await readFile(destination);assert.equal(await download.failure(),null);
    if(kind==='pdf')assert.deepEqual(bytes,pdfStub);else assert.deepEqual(JSON.parse(bytes),renamed._meta.workbook);
    downloadReceipts.push({surface:'controlled Chromium download',kind,revision:renamed._meta.workbook.revision,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),file:`controlled-${expectedName}`,stub:kind==='pdf'});
  }
  assert.equal(db.sqlite.prepare('SELECT used_bytes FROM workshop_storage_budget').get().used_bytes,beforeBudget);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM workshop_file_tickets').get().n,beforeTickets);
  assert(routeCalls.some(item=>item.path==='/api/download'&&item.kind==='pdf'&&item.status===200));
  assert(routeCalls.some(item=>item.path==='/api/download'&&item.kind==='json'&&item.status===200));
  await screen('workspace-download-after-budget-limit',workspacePage);
  checks.push('At the exact storage-admission limit, a new ticket is rejected but direct /api/download still produces actual controlled-browser PDF-stub and JSON downloads. Neither route changes the budget, ticket count, workbook or approvals.');
  await readOnly();assert.deepEqual(errors,[]);assert.deepEqual(blockedNetwork,[]);
}catch(error) {
  failure=error;console.error(error.stack);
  try {await screen('failure-widget');if(workspacePage)await screen('failure-workspace',workspacePage);}catch{}
}finally {
  await writeFile(new URL('evidence.json',out),JSON.stringify({result:failure?'fail':'pass',createdAt:new Date().toISOString(),widget:{bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')},checks,screenshots,modelCalls,hostRequests,routeCalls,downloadReceipts,themes,rendererCalls:rendered.length,errors,blockedNetwork,modelContextWrites:hostRequests.filter(item=>item.method==='ui/update-model-context').length,mutatingViewCalls:hostRequests.filter(item=>item.method==='tools/call'&&item.tool!=='download_workbook_file').length,failure:failure?.message,boundary:'Controlled headless Chromium and locally fulfilled HTTPS routes only. Real persistent MCP, SQLite and bundled widget/workspace are exercised using the fictional remote-team case. PDF bytes are an explicit protocol stub, not a rendered workbook. This does not prove Cloudflare runtime, Claude/ChatGPT native behaviour, real participant PDF rendering or actual-host file delivery.'},null,2));
  await browser.close();await client.close();await server.close();db.close();
}
if(failure)process.exitCode=1;else console.log(`Persistent controlled-browser checks passed. Evidence: ${new URL('evidence.json',out).pathname}`);
