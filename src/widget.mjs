import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { validateRecord } from './workshop.mjs';
import { InlineWorkshop } from './inline-view';
import { renderWorkbookHtml } from './workbook-html.mjs';
import workbookCss from '../skills/ai-use-case-workshop/assets/workbook.css';
import workbookFont from '../skills/ai-use-case-workshop/assets/fonts/DMSerifDisplay-Regular.ttf';
import { decodePdfFile } from './pdf-file.mjs';

const app = new App({name:'AMA-Groundwork',version:'0.9.0'}, {availableDisplayModes:['inline','fullscreen']}, {autoResize:true});
const root = createRoot(document.getElementById('workshop-root'));
let current=null, metadata={}, capabilities={}, host={}, bookHtml;
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
  const persisted=result.structuredContent?.record?.key;
  const record=validateRecord(persisted?result._meta?.workbook:result.structuredContent?.record);
  const changedSnapshot=!current||record.revision!==current.record.revision;
  if(persisted && record.revision!==result.structuredContent.record.revision) throw new Error('This reply does not match the saved version. The existing view is retained.');
  if(current) {
    if(persisted ? persisted!==current.reference?.key : !sameGroup(record,current.record)) throw new Error('This reply belongs to a different workbook. The existing snapshot is retained.');
    if(record.revision<current.record.revision) return;
    if(record.revision===current.record.revision && JSON.stringify(record)!==JSON.stringify(current.record)) throw new Error('A conflicting reply was ignored. Use the latest saved record in the conversation.');
  }
  const latestKnown=Math.max(record.revision,result.structuredContent.currentRevision??record.revision,current?.currentRevision??current?.record.revision??0);
  const historical=Boolean(result.structuredContent.view?.historical||latestKnown>record.revision||(!changedSnapshot&&current?.view?.historical));
  current={...result.structuredContent,record,currentRevision:latestKnown,view:{...result.structuredContent.view,historical},reference:persisted?result.structuredContent.record:undefined}; metadata=result._meta??{};
  try {bookHtml=renderWorkbookHtml(record,{css:workbookCss,font:workbookFont});}
  catch {bookHtml=undefined;}
  if(changedSnapshot) {generation++;pending=false;}
  // Repeated host notifications for identical saved work do not cancel a
  // download already retrieving that exact snapshot.
  if(!pending) {
    notice=current.export?.status==='failed'?'Your answers are saved, but the PDF was not generated. Ask in the conversation to retry the PDF.':'';
    noticeError=current.export?.status==='failed';
  }
}
async function requestFiles() {
  if(!connected||pending)return;
  if(!supports('message') && !(current?.workspace?.url && supports('openLinks'))) {showNotice('Ask in the conversation: “Please give us our workbook PDF.”');return;}
  const token=generation;pending=true;render();
  try {
    if(current?.workspace?.url && supports('openLinks')) {
      const response=await app.openLink({url:current.workspace.url});
      if(token===generation)showNotice(response?.isError?'The workbook link did not open. Ask for the PDF in the conversation.':'The workbook link is ready to open in your browser.',Boolean(response?.isError));
      return;
    }
    const response=await app.sendMessage({role:'user',content:[{type:'text',text:'Please give us our existing workbook PDF. Do not restart the exercise.'}]},{timeout:15000});
    if(token!==generation)return;
    showNotice(response?.isError?'The file request was not accepted. Ask for the PDF in the conversation.':'The file request is ready in the conversation. Send it if your chat app asks you to.',Boolean(response?.isError));
  } catch {if(token===generation)showNotice('The file request could not be prepared. Ask for the PDF in the conversation.',true);}
  finally {if(token===generation){pending=false;render();}}
}
async function download(kind) {
  if(!current||!connected||pending)return;
  if(!supports('downloadFile'))return requestFiles();
  const isPdf=kind==='pdf';
  if(isPdf && (!supports('serverTools') || typeof DecompressionStream==='undefined'))return requestFiles();
  const token=generation;pending=true;render();
  try {
    let file={name:`ama-groundwork-revision-${current.record.revision}.json`,text:JSON.stringify(current.record,null,2)};
    if(isPdf) {
      showNotice('Preparing your workbook PDF.');
      const result=await app.callServerTool({name:'download_workbook_file',arguments:{record:current.reference??current.record}},{timeout:60000});
      if(token!==generation)return;
      if(result.isError)throw new Error(errorText(result)||'The PDF could not be prepared.');
      const decoded=await decodePdfFile(result,current.record.revision);
      file={...decoded,name:`ama-groundwork-r${current.record.revision}.pdf`};
      if(token!==generation)return;
    }
    const name=String(file.name).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,160);
    const resource={uri:`file:///${encodeURIComponent(name)}`,mimeType:isPdf?'application/pdf':'application/json',...(isPdf?{blob:file.blob}:{text:file.text})};
    const response=await app.downloadFile({contents:[{type:'resource',resource}]},{timeout:30000});
    if(token===generation)showNotice(response?.isError?'The download was declined. Ask for normal file links in the conversation.':'Check the chat app’s download prompt or files area.',Boolean(response?.isError));
  } catch(error) {if(token===generation)showNotice(`${error.message || 'The download did not complete.'} You can request the PDF in the conversation.`,true);}
  finally {if(token===generation){pending=false;render();}}
}
function render() {
  // A host can mount an errored tool without ever sending its result. Render
  // nothing until a valid visual snapshot arrives, including after connect.
  if(!current) {root.render(null);return;}
  const record=current?.record??null;
  root.render(createElement(InlineWorkshop,{
    record,phaseId:current?.view?.phaseId??record?.phases.find(p=>p.status!=='confirmed')?.id??6,
    bookHtml,hasPdf:Boolean(record?.phases.some(phase=>phase.status!=='draft')),exportFailed:current?.export?.status==='failed',
    notice,noticeError,busy:pending,connected,onDownload:download,onRequestFiles:requestFiles,
    workspaceUrl:current?.workspace?.url,continuation:current?.reference,latestRevision:current?.currentRevision,
    isHistorical:Boolean(current?.view?.historical || (current?.currentRevision !== undefined && current.currentRevision > record.revision)),
    onOpenWorkspace:async()=>{if(current?.workspace?.url)await app.openLink({url:current.workspace.url});},
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
app.ontoolresult=result=>{
  // Some hosts mount the app even for tools with no UI metadata. Do not turn
  // their routine result into another workbook or replace a historical view.
  if(result?.isError || result.structuredContent?.view?.display===false) {render();return;}
  try{receive(result);render();}catch(error){showNotice(error.message,true);}
};
app.onhostcontextchanged=hostContext;
app.ontoolcancelled=()=>{generation++;pending=false;showNotice('The operation was cancelled. This saved snapshot remains available.');};
app.onclose=()=>{connected=false;generation++;pending=false;showNotice('This is a saved snapshot. Continue the workshop in the conversation.');};
render();
app.connect().then(()=>{connected=true;capabilities=app.getHostCapabilities()??{};hostContext(app.getHostContext());if(!current)showNotice('Waiting for the saved workbook.');else render();}).catch(()=>{connected=false;showNotice('The visual could not connect. Continue in chat and ask for the workbook PDF.',true);});
