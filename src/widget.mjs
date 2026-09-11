import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { validateRecord } from './workshop.mjs';
import { InlineWorkshop } from './inline-view';
import { contextForQuestionOwner, CHAT_QUESTION_POLICY } from './question-routing.mjs';

const app = new App({name:'AI Use-Case Workshop',version:'0.3.1'}, {availableDisplayModes:['inline','fullscreen']}, {autoResize:true});
const root = createRoot(document.getElementById('workshop-root'));
let current=null, metadata={}, capabilities={}, host={};
let connected=false, pending=false, contextBlocked=false, dirty=false;
let recordConflict=null, generation=0, displayedPhase=1;
let questionOwner='ui';
const seenResultTurns = new Set();
let noticeText='Connecting to the conversation.', noticeError=false;
const activePhase = record => record.phases.find(phase=>phase.status!=='confirmed')?.id ?? 6;
const sameRecord = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const sameGroupDetails = (a,b) => a.group.name===b.group.name && a.group.date===b.group.date;
const supports = key => Boolean(capabilities[key]);
const errorText = result => (result?.content??[]).filter(item=>item.type==='text').map(item=>item.text).join('\n').slice(0,1500);

function parsedResult(result) {
  if (!result || result.isError) throw new Error(errorText(result)||'The change was not accepted.');
  try {return {...result.structuredContent,record:validateRecord(result.structuredContent?.record)};}
  catch {throw new Error('The connector did not return a complete valid group record. Your previous record remains available.');}
}
function showNotice(message,error=false) {noticeText=message;noticeError=error;render();}
function holdRecord(result,kind) {
  recordConflict={result,kind};generation++;pending=false;
  showNotice(kind==='details'?'The group details changed. Confirm this is still your group before continuing.':'Two different records have the same revision. Choose which one your group wants to use.',true);
  throw new Error(noticeText);
}
function setResult(result,{requestRecord,allowSame=false,fromHost=false}={}) {
  const data=parsedResult(result);
  if(requestRecord && JSON.stringify(requestRecord.group)!==JSON.stringify(data.record.group)) throw new Error('An action reply changed the group details unexpectedly. Your previous record is retained.');
  if(current) {
    if(data.record.revision<current.record.revision) throw new Error('An older reply was ignored. The newer record is still shown.');
    if(data.record.revision===current.record.revision && !sameRecord(data.record,current.record)) holdRecord(result,'revision');
    if(fromHost && !sameGroupDetails(current.record,data.record)) holdRecord(result,'details');
  }
  if(requestRecord && data.record.revision<requestRecord.revision+(allowSame?0:1)) throw new Error('The reply did not contain the expected updated record. Your previous record is retained.');
  const advanced=!current || activePhase(data.record)!==activePhase(current.record);
  current=data;metadata=result._meta??{};
  if(data.questionTurn?.turnId)seenResultTurns.add(data.questionTurn.turnId);
  questionOwner=data.questionTurn?.owner === 'chat' ? 'chat' : 'ui';
  if(advanced) displayedPhase=activePhase(data.record);
  if(fromHost) {generation++;pending=false;}
  return data;
}
async function syncContext(token=generation) {
  const payload=contextForQuestionOwner(current,questionOwner);contextBlocked=true;render();
  if(!supports('updateModelContext')) return false;
  try {
    const result=await app.updateModelContext({content:[{type:'text',text:`Use this latest complete workshop record, revision ${payload.record.revision}. A saved choice is not phase approval. ${payload.questionTurn.instruction} Never replace recorded reasoning without the group.`}],structuredContent:payload},{timeout:15000});
    if(token!==generation) return false;
    if(result?.isError) throw new Error('declined');
    contextBlocked=false;return true;
  } catch {if(token===generation) contextBlocked=true;return false;}
}
async function callTool(name,args,{allowSame=false,phaseId,success='Your answer is saved.'}={}) {
  if(!current || !connected || pending || contextBlocked || recordConflict) return;
  if(questionOwner==='chat' && name!=='export_workbook')return;
  if(!supports('serverTools') || !supports('updateModelContext')) {showNotice('This host cannot save visual choices. Continue the exercise in the conversation.',true);return;}
  const requestRecord=current.record,token=++generation;
  pending=true;showNotice(name==='confirm_workshop_phase'?'Adding this step to your workbook…':'Saving your choice…');
  try {
    const result=await app.callServerTool({name,arguments:args},{timeout:name==='workshop_action'?20000:90000});
    if(token!==generation) return;
    setResult(result,{requestRecord,allowSame});
    if(phaseId && name==='workshop_action') displayedPhase=phaseId;
    const synced=await syncContext(token);
    if(token!==generation) return;
    pending=false;
    showNotice(!synced?'Your answer was saved, but the conversation did not receive it. Retry sharing before the next change.':current.export?.status==='failed'?'This step is approved. The PDF failed; retry it from your workbook without approving again.':success,!synced||current.export?.status==='failed');
  } catch(error) {if(token===generation){pending=false;showNotice(error.message||'The change could not be saved. Your previous record is retained.',true);}}
}
async function retryContext() {
  if(!current || !connected || pending || recordConflict) return;
  pending=true;render();const token=generation,synced=await syncContext(token);
  if(token!==generation)return;
  pending=false;showNotice(synced?'The conversation now has the latest record.':'Sharing still failed. Keep the JSON backup and continue in the conversation.',!synced);
}
async function resolveRecordConflict(useIncoming) {
  if(!recordConflict || !connected || pending)return;
  if(useIncoming){current=parsedResult(recordConflict.result);metadata=recordConflict.result._meta??{};displayedPhase=activePhase(current.record);questionOwner=current.questionTurn?.owner==='chat'?'chat':'ui';if(current.questionTurn?.turnId)seenResultTurns.add(current.questionTurn.turnId);}
  recordConflict=null;contextBlocked=true;pending=true;const token=++generation;
  render();const synced=await syncContext(token);
  if(token!==generation)return;
  pending=false;showNotice(synced?'Your chosen record is shared. Unsaved wording remains a draft.':'Your chosen record is retained. Retry sharing before continuing.',!synced);
}
async function ask(prompt,{handoff=true}={}) {
  if(!current || !connected || pending || contextBlocked || recordConflict || !supports('message')) return;
  pending=true;render();const token=generation;
  try {
    if(handoff){
      questionOwner='chat';render();
      const shared=await syncContext(token);
      if(token!==generation)return;
      if(!shared)throw new Error('The handoff could not be shared.');
    }
    const result=await app.sendMessage({role:'user',content:[{type:'text',text:`Group ${JSON.stringify(current.record.group.name)}, record revision ${current.record.revision}. Use the latest complete record shared by this view; reconcile any newer record first. ${handoff?`The participant explicitly chose to continue in chat; the activity's question controls are paused. ${CHAT_QUESTION_POLICY}`:'This is a file-delivery request only. Do not ask any workshop question or change question ownership.'} ${prompt}`}]},{timeout:15000});
    if(token!==generation)return;
    if(result?.isError)throw new Error('declined');
    showNotice('Continue in the conversation. Your saved work stays here.');
  }catch{
    if(token===generation){
      if(handoff){questionOwner='ui';await syncContext(token);}
      if(token===generation)showNotice(contextBlocked?'The handoff did not complete. Retry sharing before continuing.':'The message could not be sent. Your activity is available again.',true);
    }
  }
  finally{if(token===generation){pending=false;render();}}
}
async function resumeUi() {
  if(!current || !connected || pending || contextBlocked || recordConflict)return;
  const token=++generation;pending=true;questionOwner='ui';render();
  const shared=await syncContext(token);
  if(token!==generation)return;
  pending=false;showNotice(shared?'Continue with the activity.':'Retry sharing before continuing with the activity.',!shared);
}
const filePrompt='Show the existing workbook PDF and JSON backup using normal file links from the latest tool result. Do not regenerate existing files just to retrieve their links.';
async function download(kind) {
  if(!current || !connected || pending)return;
  if(!supports('downloadFile')) {
    if(contextBlocked || recordConflict || !supports('message')) {showNotice('Use the JSON backup below, or request the existing PDF links in the conversation.',true);return;}
    return ask(filePrompt,{handoff:false});
  }
  const isPdf=kind==='pdf',file=metadata.artifacts?.[kind]??(!isPdf?{name:`workshop-revision-${current.record.revision}.json`,text:JSON.stringify(current.record,null,2)}:null);
  if(!file || (isPdf && typeof file.blob!=='string') || (!isPdf && typeof file.text!=='string')) {showNotice('This revision has no PDF yet. Create it from your workbook.',true);return;}
  const name=String(file.name||(isPdf?'our-ai-use-cases.pdf':'workshop-record.json')).replace(/[^A-Za-z0-9._-]/g,'-').slice(0,160);
  const resource={uri:`file:///${encodeURIComponent(name)}`,mimeType:isPdf?'application/pdf':'application/json',...(isPdf?{blob:file.blob}:{text:file.text})};
  const token=generation;pending=true;render();
  try{const result=await app.downloadFile({contents:[{type:'resource',resource}]},{timeout:30000});if(token===generation)showNotice(result?.isError?'The download was declined or cancelled. Request the existing file links in chat.':'Check the host’s download prompt or files area.',Boolean(result?.isError));}
  catch{if(token===generation)showNotice('The download could not be completed. Request the existing file links in the conversation.',true);}
  finally{if(token===generation){pending=false;render();}}
}
function render() {
  const record=current?.record??null;
  root.render(createElement(InlineWorkshop,{
    record,phaseId:displayedPhase,activePhase:record?activePhase(record):1,allConfirmed:Boolean(record?.phases.every(phase=>phase.status==='confirmed')),
    bookHtml:metadata.bookHtml,hasPdf:Boolean(metadata.artifacts?.pdf),exportFailed:current?.export?.status==='failed',presentation:current?.presentation,
    notice:noticeText,noticeError,busy:pending,connected,contextBlocked,chatActive:questionOwner==='chat',onResumeUi:resumeUi,
    conflict:recordConflict?{kind:recordConflict.kind,incoming:parsedResult(recordConflict.result).record}:null,
    canMutate:Boolean(record && questionOwner==='ui' && connected && !pending && !contextBlocked && !recordConflict && supports('serverTools') && supports('updateModelContext') && displayedPhase<=activePhase(record)),
    canChat:Boolean(record && questionOwner==='ui' && connected && !pending && !contextBlocked && !recordConflict && supports('message')),
    onAction:action=>callTool('workshop_action',{record:current.record,action},{allowSame:true,phaseId:action.phaseId}),
    onAsk:ask,onDownload:download,onRetrySync:retryContext,onResolve:resolveRecordConflict,
    onDirty:value=>{if(dirty!==value){dirty=value;render();}},
    onPhase:phase=>{displayedPhase=phase;render();},
    onConfirm:phase=>{if(dirty)return Promise.resolve();return callTool('confirm_workshop_phase',{record:current.record,phase,approved:true,confirmation:`Our group approves the displayed Step ${phase} summary in revision ${current.record.revision}.`},{success:`Step ${phase} is approved and added to your workbook.`});},
    onExport:()=>callTool('export_workbook',{record:current.record},{allowSame:true,success:'Your workbook PDF is ready.'}),
  }));
}
function hostContext(context={}) {
  host={...host,...context};
  if(context.theme)applyDocumentTheme(context.theme);
  document.documentElement.classList.toggle('dark',host.theme==='dark');
  if(context.styles?.variables)applyHostStyleVariables(context.styles.variables);
  if(context.styles?.css?.fonts)applyHostFonts(context.styles.css.fonts);
  for(const side of ['top','right','bottom','left']){const value=Number(host.safeAreaInsets?.[side]);document.documentElement.style.setProperty(`--safe-${side}`,Number.isFinite(value)&&value>=0?`${Math.min(value,100)}px`:'0px');}
}
app.ontoolresult=result=>{
  try {
    const incoming=parsedResult(result);
    // Re-delivery of an already adopted result must not reverse a local
    // ownership handoff. Fresh tool calls have distinct presentation turn IDs,
    // even when the participant record and its revision are unchanged.
    if(incoming.questionTurn?.turnId && seenResultTurns.has(incoming.questionTurn.turnId))return;
    if(current && sameRecord(incoming.record,current.record) && (pending || contextBlocked || recordConflict))return;
    if(recordConflict){showNotice('Choose between the displayed records before accepting another update.',true);return;}
    setResult(result,{fromHost:true,allowSame:true});
    if(!contextBlocked){noticeText=current.export?.status==='failed'?'This step is approved. Retry the PDF from your workbook.':'';noticeError=current.export?.status==='failed';}
    render();
  }catch(error){showNotice(error.message,true);}
};
app.onhostcontextchanged=hostContext;
app.ontoolcancelled=()=>{generation++;pending=false;showNotice('The operation was cancelled. Check the conversation’s latest record before retrying.',true);};
app.onclose=()=>{connected=false;generation++;pending=false;showNotice('This view is disconnected. Continue from the latest group record in the conversation.',true);};
render();
app.connect().then(()=>{connected=true;capabilities=app.getHostCapabilities()??{};hostContext(app.getHostContext());if(!current)showNotice('Waiting for your group’s workshop record.');else render();}).catch(()=>{connected=false;showNotice('This host could not connect the view. Continue the exercise and request the workbook in the conversation.',true);});
