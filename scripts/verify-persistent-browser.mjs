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
const out=new URL('../output/compact-browser/',import.meta.url);
const screens=new URL('screens/',out);
await mkdir(screens,{recursive:true});
const html=await readFile(new URL('../dist/widget.html',import.meta.url),'utf8');
const pdfStub=Buffer.from('%PDF-persistent-browser-protocol-stub-NOT-a-rendered-workbook');
const pdfHash=createHash('sha256').update(pdfStub).digest('hex');
const baseUrl='https://persistent-workbook-harness.test';
const harnessUrl=`${baseUrl}/controlled-host`;
const db=createSqliteD1(),store=createD1SessionStore(db);
const rendered=[];
let failNextRender=false;
const pdfRenderer=async record=>{rendered.push(record.revision);if(failNextRender){failNextRender=false;throw new Error('Controlled PDF preparation failure.');}return pdfStub;};
const server=await createWorkshopServer({sessionStore:store,baseUrl,writesEnabled:true,pdfRenderer});
const client=new Client({name:'controlled-persistent-browser',version:'1'},{capabilities:{extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}}});
const [serverTransport,clientTransport]=InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(serverTransport),client.connect(clientTransport)]);
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const context=await browser.newContext({viewport:{width:1180,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const checks=[],screenshots=[],errors=[],blockedNetwork=[],hostRequests=[],modelCalls=[],routeCalls=[],downloadReceipts=[],themes=[],cardMetrics=[];
let expectedReference,frame,workspacePage,expectedWorkspaceUrl,failure,declineNextDownload=false;
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
    if(declineNextDownload) {declineNextDownload=false;return {isError:true};}
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
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${theme==='dark'?'#21211f':'#fff'}"><iframe id="controlled-workbook" title="Controlled persistent MCP host" sandbox="allow-scripts" style="display:block;border:0;width:100%;height:1000px"></iframe></body></html>`);
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
  const actual=await frame.locator('body').evaluate(()=>({secure:isSecureContext,crypto:Boolean(crypto?.subtle),hostDark:document.documentElement.classList.contains('dark'),osDark:matchMedia('(prefers-color-scheme:dark)').matches,ink:getComputedStyle(document.querySelector('.inline-workbook')).color,background:getComputedStyle(document.querySelector('.inline-workbook')).backgroundColor}));
  assert.equal(actual.secure,true);assert.equal(actual.crypto,true);assert.equal(actual.hostDark,theme==='dark');assert.equal(actual.osDark,os==='dark');themes.push({surface:'widget',theme,os,...actual});
  assert.equal(actual.ink,theme==='dark'?'rgb(238, 234, 226)':'rgb(48, 51, 46)');
  assert.equal(actual.background,'rgba(0, 0, 0, 0)');
}
async function emit(result) {
  await page.evaluate(result=>document.getElementById('controlled-workbook').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*'),result);
  await flush();
}
async function readOnly() {
  assert.equal(await frame.locator('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="checkbox"],[role="radio"],[role="slider"]').count(),0);
  const allowed=new Set(['View workbook','Close workbook','Download PDF','Download saved record','Refresh download','Latest workbook']);
  const labels=await frame.getByRole('button',{includeHidden:true}).evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')??button.textContent));
  for(const label of labels)assert(allowed.has(label.trim()),`Unexpected control: ${label}`);
  assert.equal(hostRequests.filter(item=>item.method==='ui/update-model-context').length,0);
  assert(hostRequests.filter(item=>item.method==='tools/call').every(item=>item.tool==='download_workbook_file'));
}
async function compactCard({error=false}={}) {
  await readOnly();
  assert.deepEqual(await frame.getByRole('button').filter({visible:true}).allTextContents(),['View workbook']);
  assert.equal(await frame.locator('summary,a[href],pre,.cw-group-identity').filter({visible:true}).count(),0,'The closed card exposes file or recovery controls.');
  assert.equal(await frame.locator('#workshop-book-dialog').isVisible(),false);
  assert.equal(await frame.locator('[data-compact="true"]').filter({visible:true}).count(),1);
  assert.equal(await frame.locator('.cw-progress [data-step]').count(),6);
  assert.equal(await frame.locator('.cw-progress p,.cw-progress-state,.cw-viewed-step').count(),0,'Progress repeats status paragraphs.');
  assert.equal(await frame.locator('[role="alert"]').filter({visible:true}).count(),error?1:0);
  assert.equal(await frame.locator('[role="status"]').filter({visible:true}).count(),0,'Routine storage or file notices appeared in the closed card.');
}
async function noOverflow(target=frame.locator('body')) {
  const size=await target.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  assert(size.page<=size.viewport+1&&size.body<=size.viewport+1,`Horizontal overflow: ${JSON.stringify(size)}`);
}
async function measureCard(phase,theme) {
  cardMetrics.push({phase,theme,...await frame.locator('.cw-card').evaluate(node=>({viewport:innerWidth,width:Math.round(node.getBoundingClientRect().width),height:Math.round(node.getBoundingClientRect().height),visibleWords:node.innerText.trim().split(/\s+/).length}))});
}
async function screen(name,target=page) {
  const file=new URL(`${name}.png`,screens);
  const mask=target===page?[frame.locator('.cw-access-link,[aria-label="Private continuation reference"]').filter({visible:true})]:[];
  await target.screenshot({path:file.pathname,fullPage:true,mask});screenshots.push(`screens/${name}.png`);
}
async function idle(){await frame.locator('.inline-workbook[aria-busy="false"]').waitFor();await flush();}
const visibleButton=name=>frame.getByRole('button',{name,exact:true}).filter({visible:true}).first();
async function openBook() {
  await visibleButton('View workbook').click();await frame.locator('#workshop-book-dialog').waitFor({state:'visible'});
  const book=frame.locator('#workshop-book-dialog');
  assert.equal(await book.locator('input,textarea,select,[contenteditable]').count(),0);
  assert.equal(await frame.locator('[data-compact="true"]').filter({visible:true}).count(),0);
  return book;
}
async function closeBook(){await visibleButton('Close workbook').click();await frame.locator('#workshop-book-dialog').waitFor({state:'hidden'});await flush();assert.equal(await visibleButton('View workbook').evaluate(node=>node===document.activeElement),true);}
async function revealFiles() {
  if(!await visibleButton('Download saved record').isVisible())await frame.getByText('Save access and files',{exact:true}).click();
  await visibleButton('Download saved record').waitFor();
  await visibleButton('Refresh download').waitFor();
}
const strings=value=>typeof value==='string'?[value]:Array.isArray(value)?value.flatMap(strings):value&&typeof value==='object'?Object.values(value).flatMap(strings):[];
async function completeWording(book,record) {
  const text=await book.evaluate(node=>{const copy=node.cloneNode(true);copy.querySelectorAll('pre').forEach(item=>item.remove());return copy.textContent;});
  for(const phase of record.phases)for(const value of strings(phase.answers))assert(text.includes(value),`Step ${phase.id} lost saved wording: ${value.slice(0,60)}`);
  assert(text.includes(record.group.problem));
  assert(text.includes(record.group.name));
}

try {
  const prepared=await call('start_workshop');assert.equal(prepared.structuredContent.pending,true);
  let result=await call('start_workshop',{record:prepared.structuredContent.record,group,mode:'text'});
  const empty=await call('show_workbook',{record:result.structuredContent.record,phase:1});
  await mount(empty);await compactCard();await noOverflow();await screen('step-1-empty');
  assert.equal(await frame.getByText('No PDF is attached to this snapshot.',{exact:true}).filter({visible:true}).count(),0);
  const longOutcome='A recorded outcome can need careful reading without making the conversation card long. '.repeat(10).trim();
  result=await call('save_workshop_phase',{record:result.structuredContent.record,phase:1,answers:{outcome:longOutcome}});
  const longView=await call('show_workbook',{record:result.structuredContent.record,phase:1});
  await emit(longView);await waitRecord(longView);await compactCard();
  assert(!(await frame.locator('.inline-workbook').innerText()).includes(longOutcome),'The compact card repeats the complete long paragraph.');
  const longBook=await openBook();await completeWording(longBook,longView._meta.workbook);await screen('long-draft-workbook');await closeBook();
  const draftExport=await call('export_workbook',{record:longView.structuredContent.record});
  assert.equal(draftExport.structuredContent.export.status,'failed');
  assert.deepEqual(draftExport._meta.workbook,longView._meta.workbook);
  assert.equal(draftExport._meta.workbook.phases[0].status,'draft');
  await emit(draftExport);await waitRecord(draftExport);await compactCard({error:true});
  assert.equal(await frame.getByRole('alert').innerText(),'The file request did not complete. Your answers are saved.');
  await openBook();assert.match(await frame.getByRole('alert').innerText(),/^Your answers are saved, but the PDF was not generated\./);assert(!/approved/i.test(await frame.getByRole('alert').innerText()));await closeBook();
  await emit(longView);await waitRecord(longView);await compactCard();
  checks.push('The empty and long-answer draft cards show one View workbook action. Full draft wording is available after expansion, without answer inputs or routine PDF/storage notices.');
  const snapshots=[];
  for(let phase=1;phase<=6;phase++) {
    result=await call('save_workshop_phase',{record:result.structuredContent.record,phase,answers:answers[phase-1]});
    const draft=await call('show_workbook',{record:result.structuredContent.record,phase});
    await mount(draft);await frame.locator(`[data-visual="${visualKinds[phase-1]}"][data-compact="true"]`).filter({visible:true}).waitFor();
    await compactCard();await noOverflow();await screen(`step-${phase}-saved`);
    const draftBook=await openBook();await completeWording(draftBook,draft._meta.workbook);await closeBook();
    result=await call('confirm_workshop_phase',{record:result.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`browser-approve-${phase}`});
    assert.equal(result._meta.workbook.phases[phase-1].status,'confirmed');assert.equal(result.structuredContent.export.status,'ready');
    await emit(result);await waitRecord(result);
    assert.equal(await frame.locator('.cw-progress [data-state="approved"]').count(),phase);
    await compactCard();
    const book=await openBook();await completeWording(book,result._meta.workbook);const text=await book.textContent();
    for(const marker of chapterMarkers.slice(0,phase))assert(text.includes(marker));
    await closeBook();await measureCard(phase,'light');await screen(`step-${phase}-approved`);snapshots.push(result);
  }
  checks.push('Six real SQLite-backed phases render six distinct compact read-only visuals, one closed action and a labelled progress track. Short model references and full _meta.workbook snapshots stay aligned; each expanded workbook retains every saved answer including drafts.');
  const complete=snapshots[5];
  await openBook();await screen('complete-book');await closeBook();
  const rename=await call('save_workshop_phase',{record:complete.structuredContent.record,phase:6,group:renamedGroup});
  const renamed=await call('show_workbook',{record:rename.structuredContent.record,phase:6});
  assert.equal(renamed.structuredContent.record.key,complete.structuredContent.record.key);
  await emit(renamed);await waitRecord(renamed);
  assert((await frame.locator('.cw-group-identity').textContent()).includes(renamedGroup.name));await compactCard();await openBook();await screen('group-name-correction');await closeBook();
  const mismatch=structuredClone(renamed);mismatch.structuredContent.record.revision++;
  await emit(mismatch);await waitRecord(renamed);await compactCard({error:true});
  assert.equal(await frame.getByRole('alert').innerText(),'Could not update this view. Your saved workbook is unchanged.');
  await screen('mismatched-source-rejected');
  await openBook();assert.match(await frame.getByRole('alert').innerText(),/(?:revision|snapshot|saved version)/i);await closeBook();
  await emit(renamed);await waitRecord(renamed);await compactCard();
  const ordinary=structuredClone(renamed);ordinary.structuredContent.view.display=false;ordinary._meta.workbook.group.name='This ordinary reply must not replace a visual.';
  await emit(ordinary);await waitRecord(renamed);await compactCard();
  await emit({isError:true,content:[{type:'text',text:'An unrelated tool failed.'}]});await waitRecord(renamed);await compactCard();
  const otherPrepared=await call('start_workshop'),other=await call('start_workshop',{record:otherPrepared.structuredContent.record,group:{...group,name:'Separate fictional group'}});
  const otherView=await call('show_workbook',{record:other.structuredContent.record,phase:1});
  await emit(otherView);await waitRecord(renamed);
  await compactCard({error:true});await screen('foreign-workbook-rejected');
  await openBook();await frame.getByText('This reply belongs to a different workbook. The existing snapshot is retained.',{exact:true}).waitFor();await closeBook();
  await emit(renamed);await waitRecord(renamed);
  checks.push('A same-key group-name correction is accepted. Mismatched source/reference revisions and foreign-session snapshots are rejected; non-visual and unrelated error notifications cannot replace the saved card.');
  await openBook();await revealFiles();
  await visibleButton('Download PDF').click();await idle();
  await visibleButton('Download saved record').click();await idle();
  assert.equal(downloadReceipts.filter(item=>item.surface==='mock host request').length,2);
  declineNextDownload=true;await visibleButton('Download saved record').click();await idle();
  await frame.getByRole('alert').filter({hasText:'download was declined'}).waitFor();
  await waitRecord(renamed);
  await closeBook();await compactCard({error:true});
  await emit(renamed);await waitRecord(renamed);await compactCard();await openBook();await revealFiles();
  await visibleButton('Latest workbook').click();await idle();
  assert.equal(hostRequests.filter(item=>item.method==='ui/open-link').length,1);
  await visibleButton('Refresh download').click();await idle();
  await closeBook();await compactCard();
  checks.push('The widget file tool uses only the short snapshot reference. PDF stub bytes and full JSON reach mocked native-download requests; the reading link uses ui/open-link and carries only a read key in its fragment. No model-context or record-changing calls originate in the view.');
  await page.setViewportSize({width:600,height:900});
  for(let phase=1;phase<=6;phase++) {
    await mount(snapshots[phase-1],{theme:'light',os:'dark'});
    await compactCard();await noOverflow();await measureCard(phase,'light');await screen(`host-600-step-${phase}`);
  }
  for(const theme of ['light','dark']) {
    await page.setViewportSize({width:320,height:900});
    for(let phase=1;phase<=6;phase++) {
      await mount(snapshots[phase-1],{theme,os:theme==='light'?'dark':'light'});
      await compactCard();await noOverflow();await measureCard(phase,theme);await screen(`mobile-${theme}-step-${phase}`);
      const book=await openBook();await completeWording(book,snapshots[phase-1]._meta.workbook);await noOverflow();await closeBook();
    }
  }
  checks.push('All six saved visuals fit 320 px in light and dark host themes against the opposite OS preference, without answer controls.');
  await mount(longView,{theme:'dark',os:'light'});await compactCard();await noOverflow();await screen('mobile-dark-long-draft');
  const narrowLongBook=await openBook();await completeWording(narrowLongBook,longView._meta.workbook);await noOverflow();await screen('mobile-dark-long-workbook');await closeBook();
  const reviewPrepared=await call('start_workshop');
  let review=await call('start_workshop',{record:reviewPrepared.structuredContent.record,group:{...group,name:'Fictional correction check'}});
  for(let phase=1;phase<=4;phase++) {
    review=await call('save_workshop_phase',{record:review.structuredContent.record,phase,answers:answers[phase-1]});
    review=await call('confirm_workshop_phase',{record:review.structuredContent.record,phase,approved:true,confirmation:approval,requestId:`browser-review-${phase}`});
  }
  review=await call('save_workshop_phase',{record:review.structuredContent.record,phase:2,answers:{firstGap:'Corrected fictional proposal: first ask the employee what makes the current checkpoint difficult.'}});
  const reviewView=await call('show_workbook',{record:review.structuredContent.record,phase:4});
  await mount(reviewView,{theme:'dark',os:'light'});await compactCard();await noOverflow();
  assert.equal(await frame.locator('[data-step="4"]').getAttribute('data-state'),'review');
  assert.equal(await frame.locator('[data-step="2"]').getAttribute('aria-current'),'step');
  assert.equal(await frame.locator('.cw-step-state').innerText(),'Needs review · Step 2 next');
  await screen('mobile-dark-needs-review');
  const reviewBook=await openBook();await completeWording(reviewBook,reviewView._meta.workbook);await noOverflow();await closeBook();
  review=await call('confirm_workshop_phase',{record:review.structuredContent.record,phase:2,approved:true,confirmation:approval,requestId:'browser-corrected-context'});
  failNextRender=true;
  const reviewExport=await call('export_workbook',{record:review.structuredContent.record});
  assert.equal(reviewExport.structuredContent.export.status,'failed');
  assert.deepEqual(reviewExport._meta.workbook,review._meta.workbook);
  assert.equal(reviewExport.structuredContent.phase.status,'needs_review');
  await mount(reviewExport,{theme:'dark',os:'light'});await compactCard({error:true});await noOverflow();
  assert.equal(await frame.getByRole('alert').innerText(),'The file request did not complete. Your answers are saved.');
  await openBook();assert.match(await frame.getByRole('alert').innerText(),/^Your answers are saved, but the PDF was not generated\./);assert(!/approved/i.test(await frame.getByRole('alert').innerText()));await closeBook();
  await screen('mobile-dark-review-export-failed');
  checks.push('A long saved draft remains readable at 320 px; an earlier correction keeps the viewed later step marked needs-review and identifies Step 2 as next without approving new work.');
  checks.push('Actual draft and needs-review export failures retain their exact records. Neither the compact error nor the expanded error invents group approval.');
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
  await writeFile(new URL('evidence.json',out),JSON.stringify({result:failure?'fail':'pass',createdAt:new Date().toISOString(),widget:{bytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')},checks,screenshots,modelCalls,hostRequests,routeCalls,downloadReceipts,themes,cardMetrics,rendererCalls:rendered.length,errors,blockedNetwork,modelContextWrites:hostRequests.filter(item=>item.method==='ui/update-model-context').length,mutatingViewCalls:hostRequests.filter(item=>item.method==='tools/call'&&item.tool!=='download_workbook_file').length,failure:failure?.message,boundary:'Controlled headless Chromium and locally fulfilled HTTPS routes only. Real persistent MCP, SQLite and bundled widget/workspace are exercised using the fictional remote-team case. PDF bytes are an explicit protocol stub, not a rendered workbook. This does not prove Cloudflare runtime, Claude/ChatGPT native behaviour, real participant PDF rendering or actual-host file delivery.'},null,2));
  await browser.close();await client.close();await server.close();db.close();
}
if(failure)process.exitCode=1;else console.log(`Persistent controlled-browser checks passed. Evidence: ${new URL('evidence.json',out).pathname}`);
