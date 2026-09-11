import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createWorkshopServer} from '../src/server.mjs';
import {group,answers} from '../examples/hiring.mjs';

// Local controlled host; no model, account login, network service or participant data.
const output=new URL('../output/visual-review/',import.meta.url);
await mkdir(new URL('screens/',output),{recursive:true});
await mkdir(new URL('checkpoints/',output),{recursive:true});
const capabilities={extensions:{'io.modelcontextprotocol/ui':{mimeTypes:['text/html;profile=mcp-app']}}};
const server=await createWorkshopServer({capabilitiesOverride:capabilities});
const client=new Client({name:'local-visual-review',version:'1.0.0'},{capabilities});
const [a,b]=InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(a),client.connect(b)]);
const html=(await client.readResource({uri:'ui://workshop/checkpoint.html'})).contents[0].text;
const calls=[],screens=[],checks=[],errors=[],network=[];
let latest,lastToolResult,frame,browser,page,failTool=false,failSync=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function call(name,args) {
  const result=await client.callTool({name,arguments:args},undefined,{timeout:60_000});
  calls.push({name,revision:args.record?.revision,action:args.action?.kind,isError:Boolean(result.isError)});
  if(result.structuredContent?.record) latest=result.structuredContent.record;
  lastToolResult=result;
  return result;
}
async function publish(result) {
  await page.evaluate(payload=>document.querySelector('#app').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:payload},'*'),result);
  await frame.locator('.activity').waitFor();
}
async function capture(title,note) {
  const file=`screens/${String(screens.length+1).padStart(2,'0')}.png`;
  const height=await frame.locator('#workshop-root').evaluate(el=>el.getBoundingClientRect().height);
  await page.locator('#app').evaluate((el,height)=>{el.style.height=`${Math.min(4400,Math.max(850,height+30))}px`;},height);
  await page.evaluate(()=>window.scrollTo(0,0));
  const bytes=await page.screenshot({path:fileURLToPath(new URL(file,output)),fullPage:true});
  screens.push({title,note,file,sha256:hash(bytes)});
}
async function waitSync(revision) {
  await page.waitForFunction(rev=>window.reviewContext?.structuredContent?.record?.revision===rev,revision);
  assert.equal(latest.revision,revision);
}
async function clickAndSync(locator) {
  const revision=latest.revision;
  await locator.click();
  await page.waitForFunction(rev=>window.reviewContext?.structuredContent?.record?.revision>rev,revision);
  assert(latest.revision>revision);
}
async function saveDraft(phase,data) {
  const result=await call('save_workshop_phase',{record:latest,phase,answers:data});
  assert(!result.isError,JSON.stringify(result.content));await publish(result);return result;
}
async function keepPdf(result,phase) {
  assert.equal(result.structuredContent.export.status,'ready');
  const pdf=result._meta.artifacts.pdf;
  const bytes=Buffer.from(pdf.blob,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  await writeFile(new URL(`checkpoints/phase-${phase}.pdf`,output),bytes);
  await writeFile(new URL(`checkpoints/phase-${phase}.json`,output),JSON.stringify(result.structuredContent.record,null,2));
  await writeFile(new URL(`checkpoints/phase-${phase}.html`,output),result._meta.bookHtml);
  checks.push({check:`Step ${phase} actual PDF`,bytes:bytes.length,sha256:hash(bytes),revision:latest.revision});
}
async function reviewFile(failure) {
  const evidence={boundary:'Local MCP Apps harness with actual tools and local PDF rendering. Fictional hiring case. Not actual Claude/ChatGPT, installation, deployment or classroom proof.',failure:failure?.message??null,calls,checks,errors,network,screens};
  await writeFile(new URL('evidence.json',output),JSON.stringify(evidence,null,2));
  const images=await Promise.all(screens.map(async s=>({...s,image:(await readFile(new URL(s.file,output))).toString('base64')})));
  const review=`<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The rebuilt workshop connector</title><style>*{box-sizing:border-box}body{margin:0;background:#f8f5ef;color:#302821;font:17px/1.6 system-ui}main{max-width:1120px;margin:auto;padding:44px 24px}h1{font:400 46px/1.13 Georgia;margin:0 0 18px}h2{font:400 29px/1.2 Georgia}p{max-width:78ch}a{color:#944425;text-underline-offset:4px}nav{display:flex;gap:12px 22px;flex-wrap:wrap;margin:24px 0}article{margin:48px 0;padding-top:18px;border-top:1px solid #bca48e;scroll-margin-top:24px}img{width:100%;height:auto;border:1px solid #ded7ce}small{color:#65584b}a:focus-visible{outline:3px solid #944425;outline-offset:4px}footer{margin-top:40px}</style></head><body><main><h1>The rebuilt workshop connector</h1><p>The group discusses a hiring problem, makes choices in the activity, and receives a visual book assembled from its confirmed work.</p><p>${esc(evidence.boundary)}</p>${failure?`<p>Review run needs attention: ${esc(failure.message)}</p>`:'<p>The local journey below completed all six steps. The current live connector has not changed.</p>'}<nav><a href="checkpoints/phase-6.pdf">Read the completed example PDF</a><a href="checkpoints/phase-6.html">Read the book in your browser</a><a href="evidence.json">Inspect test evidence</a></nav><nav>${screens.map((s,i)=>`<a href="#screen-${i+1}">${i+1}. ${esc(s.title)}</a>`).join('')}</nav>${images.map((s,i)=>`<article id="screen-${i+1}"><h2>${esc(s.title)}</h2><p>${esc(s.note)}</p><img src="data:image/png;base64,${s.image}" alt="${esc(s.title)} in the local test host" loading="lazy"></article>`).join('')}<footer>Prepared by Dr. Shiva Kakkar. <a href="https://www.shivakakkar.com/">Click here to access the author’s profile</a></footer></main></body></html>`;
  await writeFile(new URL('index.html',output),review);
}
let failure;
try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  page=await browser.newPage({viewport:{width:1280,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
  await page.exposeFunction('reviewCall',async params=>failTool?{isError:true,content:[{type:'text',text:'The test host denied this action. No change was applied.'}]}:call(params.name,params.arguments));
  await page.exposeFunction('reviewSync',async params=>{if(failSync)throw new Error('The test host denied context synchronisation.');return {};});
  await page.setContent('<!doctype html><html><head><style>body{margin:0;background:#fff;font:15px system-ui;color:#333}header{padding:14px 24px;background:#f2f2f2}iframe{width:100%;height:1000px;border:0}</style></head><body><header>Local MCP Apps test host — fictional group. This is not a Claude or ChatGPT screen.</header><iframe id="app" title="Workshop activity" sandbox="allow-scripts"></iframe></body></html>');
  const started=await call('start_workshop',{group});
  await page.evaluate(({html,started})=>{
    window.reviewContext=null;window.reviewMessages=[];
    window.addEventListener('message',async event=>{
      if(event.source!==document.querySelector('#app').contentWindow)return;
      const req=event.data;if(req?.jsonrpc!=='2.0')return;
      const reply=result=>event.source.postMessage({jsonrpc:'2.0',id:req.id,result},'*');
      try {
        if(req.method==='ui/initialize')reply({protocolVersion:req.params.protocolVersion,hostInfo:{name:'Local review',version:'1'},hostCapabilities:{serverTools:{},updateModelContext:{},message:{text:{}},logging:{},downloadFile:{}},hostContext:{theme:'light',displayMode:'inline',availableDisplayModes:['inline','fullscreen'],containerDimensions:{width:1280},styles:{variables:{'--color-text-primary':'#202020','--color-text-secondary':'#606060','--color-background-primary':'#ffffff','--color-background-secondary':'#f5f5f5','--color-border-primary':'#d5d5d5'}}}});
        else if(req.method==='ui/notifications/initialized')event.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:started},'*');
        else if(req.method==='tools/call')reply(await window.reviewCall(req.params));
        else if(req.method==='ui/update-model-context'){await window.reviewSync(req.params);window.reviewContext=req.params;reply({});}
        else if(req.method==='ui/message'){window.reviewMessages.push(req.params);reply({});}
        else if(req.method==='ui/request-display-mode')reply({mode:req.params.mode});
        else if(req.id!==undefined)reply({});
      } catch(error){event.source.postMessage({jsonrpc:'2.0',id:req.id,error:{code:-32000,message:error.message}},'*');}
    });
    document.querySelector('#app').srcdoc=html;
  },{html,started});
  frame=page.frameLocator('#app');
  await frame.locator('[data-visual]').waitFor();
  await capture('Start with the group’s problem','The first activity appears in a host-coloured surface. Group details have already come from the conversation.');
  // Mixed input: the conversation supplies meaning; a single click records an unknown baseline.
  await saveDraft(1,{outcome:answers[0].outcome,kpi:answers[0].kpi});
  // A rejected context update must retain the accepted action and block further edits.
  failSync=true;
  await frame.getByRole('button',{name:'We do not know it yet',exact:true}).click();
  await frame.getByRole('button',{name:'Retry sharing with the conversation',exact:true}).waitFor();
  assert.match(latest.phases[0].answers.baseline,/Unknown/);
  assert(await frame.getByRole('button',{name:'Continue in the conversation',exact:true}).isDisabled());
  await capture('Recover a saved choice when chat has not received it','The test host deliberately rejects the context update. The accepted choice remains in the record and further changes are paused until it can be shared.');
  failSync=false;
  await frame.getByRole('button',{name:'Retry sharing with the conversation',exact:true}).click();
  await waitSync(latest.revision);
  assert.match(latest.phases[0].answers.baseline,/Unknown/);
  await capture('Choose without typing the answer again','The group clicks to record that the baseline is unknown. The real action tool returns the updated record and the host context receives it.');
  for(let phase=1;phase<=6;phase++) {
    await saveDraft(phase,answers[phase-1]);
    if(phase===2) {
      await clickAndSync(frame.locator('[data-barrier-index="1"]').getByRole('button',{name:'Authority',exact:true}));
      assert.equal(latest.interaction.barrierCategories['1'],'Authority');
    }
    if(phase===3) {
      await clickAndSync(frame.locator('[data-task-id="t5"]').getByRole('button',{name:'Try this task at zero seconds',exact:true}));
      assert.equal(latest.interaction.zeroTaskId,'t5');
      await saveDraft(3,{zeroSecond:answers[2].zeroSecond});
    }
    if(phase===4) {
      await frame.getByRole('button',{name:'Check offer readiness',exact:true}).click();
      await clickAndSync(frame.getByRole('button',{name:'Keep',exact:true}));
      assert.equal(latest.interaction.candidateDispositions.c2,'Keep');
    }
    if(phase===5) {
      await clickAndSync(frame.locator('[data-candidate-id="c2"]').getByRole('button',{name:'Later',exact:true}));
      assert.equal(latest.interaction.priorities.c2,'Later');
      const blocked=await call('confirm_workshop_phase',{record:latest,phase:5,approved:true,confirmation:'Approved'});
      assert(blocked.isError,'Changed priorities need reconciliation before approval.');
      await capture('A changed priority needs its reasoning reviewed','The board moves the candidate immediately. Confirmation is blocked until the group resolves the reason; the old rationale is not silently reused.');
      await clickAndSync(frame.locator('[data-candidate-id="c2"]').getByRole('button',{name:'First',exact:true}));
      await saveDraft(5,answers[4]);
    }
    await capture(`Step ${phase}: ${['connect the goal to a measure','classify an authority gap','test what faster drafting leaves unchanged','compare AI with the simpler alternative','choose the first comparison','bound the test and retain human authority'][phase-1]}`,'The visual reads the group’s actual recorded wording. This screenshot does not itself prove that participants find the activity usable.');
    await frame.getByText(`Review and approve Step ${phase}`,{exact:true}).click();
    const confirmButton=frame.getByRole('button',{name:'Confirm and add chapter',exact:true});
    assert(await confirmButton.isDisabled(),'Approval must remain unavailable until explicitly checked.');
    await frame.getByLabel('Our group approves this saved summary.',{exact:true}).check();
    await clickAndSync(confirmButton);
    const confirmed=lastToolResult;
    assert(!confirmed.isError,JSON.stringify(confirmed.content));await keepPdf(confirmed,phase);
    if(phase===1) {
      await frame.getByRole('button',{name:'Side by side',exact:true}).click();
      await frame.frameLocator('.book-frame').getByRole('heading',{name:group.problem,exact:true}).waitFor();
      await capture('The first approved chapter appears in the book','The activity advances while the composed book is available beside it. This is the same HTML composition used for the PDF.');
      await frame.getByRole('button',{name:'Activity',exact:true}).click();
    }
  }
  assert(latest.phases.every(p=>p.status==='confirmed'));
  await frame.getByRole('button',{name:'Our book',exact:true}).click();
  await frame.frameLocator('.book-frame').getByRole('heading',{name:/Step 6\./}).waitFor();
  await capture('The group’s completed book','The book contains the cover and every confirmed chapter. It remains an authored document, with diagrams and decisions from the group rather than a chat transcript.');
  await frame.getByRole('button',{name:'Activity',exact:true}).click();
  for(const width of [320,390]) {
    await page.setViewportSize({width,height:1000});
    assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Overflow at ${width}px`);
  }
  await capture('The activity at a narrow width','The same controls and full wording remain available at 390 pixels without horizontal overflow.');
  await page.setViewportSize({width:1280,height:1000});
  await page.emulateMedia({reducedMotion:'reduce',colorScheme:'dark'});
  await page.evaluate(()=>document.querySelector('#app').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:'dark',styles:{variables:{'--color-text-primary':'#ededed','--color-text-secondary':'#b6bac0','--color-background-primary':'#242424','--color-background-secondary':'#303030','--color-border-primary':'#62666c'}}}},'*'));
  await frame.locator('html.dark').waitFor();
  await capture('Host dark mode','The activity follows the host theme and honours reduced motion. The book retains its paper-based Terracotta design.');
  await page.emulateMedia({reducedMotion:'reduce',colorScheme:'light'});
  await page.evaluate(()=>document.querySelector('#app').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params:{theme:'light',styles:{variables:{'--color-text-primary':'#202020','--color-text-secondary':'#606060','--color-background-primary':'#ffffff','--color-background-secondary':'#f5f5f5','--color-border-primary':'#d5d5d5'}}}},'*'));
  // Late results must never overwrite newer corrected state inside the same mounted view.
  const old=await call('workshop_next',{record:latest});
  const correction=await call('save_workshop_phase',{record:latest,phase:3,answers:{zeroSecond:'Approved pay would still be needed before release.'}});
  await publish(correction);
  await publish(old);
  assert.equal(latest.phases[3].status,'needs_review');
  await frame.getByText(/An older reply arrived and was ignored/).waitFor();
  await capture('A correction preserves later work for review','An earlier answer changes. Later chapters remain present but need review; a deliberately delivered older reply cannot overwrite the newer record in this view.');
  checks.push({check:'Six actual tool confirmations with PDFs, visual action callbacks and model context',pass:true});
  assert.equal(network.length,0,'Views must make no external requests.');
  assert.equal(errors.length,0,errors.join('\n'));
} catch(error) {failure=error;console.error(error.stack);}
finally {await reviewFile(failure);await browser?.close();await client.close();await server.close();}
if(failure)process.exitCode=1;else console.log(`Passed local visual journey; ${screens.length} screens at ${fileURLToPath(output)}index.html`);
