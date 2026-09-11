import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { validateRecord } from './workshop.mjs';
import { InlineWorkshop } from './inline-view';

const app = new App({name:'AI Use-Case Workshop',version:'0.4.0'}, {availableDisplayModes:['inline','fullscreen']}, {autoResize:true});
const root = createRoot(document.getElementById('workshop-root'));
let current=null, metadata={}, capabilities={}, host={};
let connected=false, pending=false, generation=0;
let notice='Connecting to the workbook.', noticeError=false;
const supports = key => Boolean(capabilities[key]);
const errorText = result => (result?.content??[]).filter(item=>item.type==='text').map(item=>item.text).join('\n').slice(0,1500);
function showNotice(message,error=false) {notice=message;noticeError=error;render();}
function sameGroup(a,b) {return JSON.stringify(a.group)===JSON.stringify(b.group);}

// Views can be separate historical cards in the host. They never write model
// context, send a record to the host, or invoke a record-changing server tool.
function receive(result) {
  if (!result || result.isError) throw new Error(errorText(result)||'This workbook could not be loaded. Continue in the conversation.');
  const record=validateRecord(result.structuredContent?.record);
  if(current) {
    if(!sameGroup(record,current.record)) throw new Error('This reply belongs to different group details. The existing snapshot is retained.');
    if(record.revision<current.record.revision) return;
    if(record.revision===current.record.revision && JSON.stringify(record)!==JSON.stringify(current.record)) throw new Error('A conflicting reply was ignored. Use the latest saved record in the conversation.');
  }
  current={...result.structuredContent,record}; metadata=result._meta??{};
  generation++;pending=false;
  notice=current.export?.status==='failed'?'Your step is approved, but its PDF was not generated. Ask in the conversation to retry the PDF.':'';
  noticeError=current.export?.status==='failed';
}
async function requestFiles() {
  if(!connected||pending)return;
  if(!supports('message')) {showNotice('Ask in the conversation: “Please give us the latest workbook PDF and JSON backup.”');return;}
  const token=generation;pending=true;render();
  try {
    const response=await app.sendMessage({role:'user',content:[{type:'text',text:'Please give us the latest saved workbook PDF and JSON backup as normal file links. Use the latest record in this conversation. This is a file request; do not restart the workshop questions.'}]},{timeout:15000});
    if(token!==generation)return;
    showNotice(response?.isError?'The file request was not accepted. Ask for the latest PDF and JSON in the conversation.':'The file request is ready in the conversation. Send it if your chat app asks you to.',Boolean(response?.isError));
  } catch {if(token===generation)showNotice('The file request could not be prepared. Ask for the latest PDF and JSON in the conversation.',true);}
  finally {if(token===generation){pending=false;render();}}
}
async function download(kind) {
  if(!current||!connected||pending)return;
  if(!supports('downloadFile'))return requestFiles();
  const isPdf=kind==='pdf';
  const file=metadata.artifacts?.[kind]??(!isPdf?{name:`workshop-revision-${current.record.revision}.json`,text:JSON.stringify(current.record,null,2)}:null);
  if(!file||(isPdf?typeof file.blob!=='string':typeof file.text!=='string')) {showNotice('This snapshot has no PDF attached. Ask for the latest workbook files in the conversation.');return;}
  const name=String(file.name||(isPdf?'our-ai-use-cases.pdf':'workshop-record.json')).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,160);
  const resource={uri:`file:///${encodeURIComponent(name)}`,mimeType:isPdf?'application/pdf':'application/json',...(isPdf?{blob:file.blob}:{text:file.text})};
  const token=generation;pending=true;render();
  try {
    const response=await app.downloadFile({contents:[{type:'resource',resource}]},{timeout:30000});
    if(token===generation)showNotice(response?.isError?'The download was declined. Ask for normal file links in the conversation.':'Check the chat app’s download prompt or files area.',Boolean(response?.isError));
  } catch {if(token===generation)showNotice('The download did not complete. Ask for normal file links in the conversation.',true);}
  finally {if(token===generation){pending=false;render();}}
}
function render() {
  const record=current?.record??null;
  root.render(createElement(InlineWorkshop,{
    record,phaseId:current?.view?.phaseId??record?.phases.find(p=>p.status!=='confirmed')?.id??6,
    bookHtml:metadata.bookHtml,hasPdf:Boolean(metadata.artifacts?.pdf),exportFailed:current?.export?.status==='failed',
    notice,noticeError,busy:pending,connected,onDownload:download,onRequestFiles:requestFiles,
  }));
}
function hostContext(context={}) {
  host={...host,...context};
  if(context.theme)applyDocumentTheme(context.theme);
  document.documentElement.classList.toggle('dark',host.theme==='dark');
  if(context.styles?.variables)applyHostStyleVariables(context.styles.variables);
  if(context.styles?.css?.fonts)applyHostFonts(context.styles.css.fonts);
  for(const side of ['top','right','bottom','left']) {const value=Number(host.safeAreaInsets?.[side]);document.documentElement.style.setProperty(`--safe-${side}`,Number.isFinite(value)&&value>=0?`${Math.min(value,100)}px`:'0px');}
}
app.ontoolresult=result=>{try{receive(result);render();}catch(error){showNotice(error.message,true);}};
app.onhostcontextchanged=hostContext;
app.ontoolcancelled=()=>{generation++;pending=false;showNotice('The operation was cancelled. This saved snapshot remains available.');};
app.onclose=()=>{connected=false;generation++;pending=false;showNotice('This is a saved snapshot. Continue the workshop in the conversation.');};
render();
app.connect().then(()=>{connected=true;capabilities=app.getHostCapabilities()??{};hostContext(app.getHostContext());if(!current)showNotice('Waiting for the saved workbook.');else render();}).catch(()=>{connected=false;showNotice('The visual could not connect. Continue in chat and ask for the workbook PDF.',true);});
