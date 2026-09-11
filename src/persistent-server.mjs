import { McpServer } from '@modelcontextprotocol/server';
import { getUiCapability, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { randomUUID, createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { validateRecord, savePhase, confirmPhase, currentPhase, phaseGuide, readableSummary, groupSchema, recordSchema, answerSchemas, phaseReadiness, sameValue } from './workshop.mjs';
import { actionSchema, applyWorkshopAction } from './actions.mjs';
import { presentationSchema, validatePresentation } from './presentation.mjs';
import { SERVER_QUESTION_POLICY, questionTurn } from './question-routing.mjs';
import { nextConversationQuestion } from './conversation.mjs';
import { referenceSchema, readKeyFor, canonicalJson, hashValue, SessionError } from './session-store.mjs';

const phaseNumber=z.number().int().min(1).max(6);
const modeSchema=z.enum(['auto','text']).optional();
const requestId=z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/).optional();
const answerPatch=z.object(Object.assign({},...answerSchemas.map(s=>s.shape))).partial().catchall(z.unknown());
const anyObject=z.record(z.string(),z.unknown());
const groupPatch=z.object({...groupSchema.shape,context:z.string().trim().max(400)}).partial().strict();
const reference=referenceSchema.refine(value=>value.key.startsWith('ws1_'),'Use the private continuation reference, not the read-only link.');
const arrayEdit=z.object({field:z.enum(['blockers','workflows','tasks','candidates','choices']),op:z.enum(['update','add','remove','replace']),id:z.string().max(40).optional(),index:z.number().int().min(0).max(5).optional(),value:z.unknown().optional()}).strict();
const uiUri='ui://workshop/checkpoint.html';
const uiMeta={ui:{resourceUri:uiUri},'ui/resourceUri':uiUri};
const retention='The workbook and revision history are stored privately on Cloudflare without automatic expiry, until your group explicitly deletes them. Keep the private continuation reference for editing in another chat. The separate reading link can be shared with reviewers; anyone with it can read and download the workbook. Use first names or aliases and concise summaries, not confidential transcripts.';
const hostGuide=`${SERVER_QUESTION_POLICY} Keep the latest short record reference; never reconstruct the full workbook or approval history. The server owns saved answers. On a stale write, read the returned context and retry only the intended change. Use workshop_next with phase for an earlier correction. Reuse the group's wording and label Unknown honestly. Suggestions are not evidence or approval. For arrays prefer arrayEdits to change one item; do not remove siblings unless the group asks. Technical schemas are private facilitation context; never ask participants for JSON. Keep questions brief. Do not infer employee motives, contact employees, browse or operate other systems without a separate request. When the participant prefers ordinary chat, call set_workshop_preference with mode:text once. The read-only visual never asks a question or saves an answer. Never claim a file was downloaded merely because a link was generated.`;
const phaseSchemaFor=id=>z.toJSONSchema(answerSchemas[id-1]);

function patchArrays(record,phase,answers,edits=[]) {
  const prior=record.phases[phase-1].answers;
  const patch=structuredClone(answers);
  const replaced=new Set(edits.filter(e=>e.op==='replace').map(e=>e.field));
  for(const [field,value] of Object.entries(patch)) {
    if(!Array.isArray(value)||!Array.isArray(prior[field])||replaced.has(field))continue;
    const key=field==='choices'?'candidateId':['tasks','candidates'].includes(field)?'id':null;
    const retained=key?prior[field].every(item=>value.some(next=>next[key]===item[key]))
      : prior[field].every(item=>value.some(next=>sameValue(item,next)));
    if(!retained)throw new Error(`Changing ${field} would remove or replace saved items. Use an item update, or explicit remove/replace only when the group asked for it.`);
  }
  for(const edit of edits) {
    if(!(edit.field in answerSchemas[phase-1].shape))throw new Error('That list does not belong to this step.');
    if(Object.hasOwn(answers,edit.field))throw new Error('Use either a complete list or item edits for that field, not both.');
    const items=structuredClone(patch[edit.field]??prior[edit.field]??[]);
    const key=edit.field==='choices'?'candidateId':['tasks','candidates'].includes(edit.field)?'id':null;
    if(edit.op==='replace') {if(!Array.isArray(edit.value))throw new Error('An explicit list replacement needs a complete list.');patch[edit.field]=edit.value;continue;}
    if(edit.op==='add') {if(edit.value===undefined)throw new Error('The new item is missing.');items.push(edit.value);}
    else {
      const index=key ? items.findIndex(item=>item[key]===edit.id) : edit.index;
      if(!Number.isInteger(index)||index<0||index>=items.length)throw new Error('The item was not found. Load this step and use its current item reference.');
      if(edit.op==='remove')items.splice(index,1);
      else {
        if(edit.value===undefined)throw new Error('The item change is missing.');
        if(key&&edit.value?.[key]!==undefined&&edit.value[key]!==items[index][key])throw new Error('Keep the stable item reference when updating it.');
        items[index]=typeof items[index]==='string'?edit.value:{...items[index],...edit.value};
      }
    }
    patch[edit.field]=items;
  }
  return patch;
}

export async function createPersistentWorkshopServer({sessionStore:store,pdfRenderer,assetLoader:file,capabilitiesOverride,baseUrl,writesEnabled=true}={}) {
  if(!store||typeof pdfRenderer!=='function'||typeof file!=='function')throw new Error('Persistent workshop adapters are required.');
  const origin=new URL(baseUrl);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('A fixed HTTPS workshop origin is required.');
  const server=new McpServer({name:'ai-use-case-workshop',version:'0.6.1'},{instructions:`${hostGuide} ${retention}`});
  const teaching=await file('skills/ai-use-case-workshop/references/phases.md');
  const capability=()=>getUiCapability(capabilitiesOverride??server.server.getClientCapabilities())?.mimeTypes?.includes(RESOURCE_MIME_TYPE);
  const ensureWrite=()=>{if(!writesEnabled)throw Object.assign(new Error('Saving is temporarily paused.'),{safeMessage:'Saving is temporarily paused. Your saved workbook, history and downloads remain available.'});};
  const finish=result=>{
    if(result.structuredContent)result.content.push({type:'text',text:JSON.stringify(result.structuredContent)});
    if(new TextEncoder().encode(JSON.stringify(result)).length>140000&&result._meta?.workbook){
      delete result._meta.workbook;
      result.structuredContent.view.display=false;
      const context=result.structuredContent.context??{};
      result.structuredContent.context={taskIds:context.tasks?.map(item=>item.id),candidateIds:context.candidates?.map(item=>item.id),choices:context.choices?.map(({candidateId,decision})=>({candidateId,decision}))};
      delete result.structuredContent.phase.instructions;
      result.structuredContent.hostingGuide='The selected phase answers are complete. Cross-phase context is reduced to stable IDs to keep this result deliverable. Use workshop_next with the relevant phase to read its complete wording before comparing or correcting it. Keep all saved wording. Follow questionTurn; the visual never asks questions.';
      result.content=result.content.filter(item=>item.type!=='text'||!item.text.startsWith('{'));
      result.content.push({type:'text',text:`This workbook is too detailed for a reliable inline snapshot. Open its saved reading link: ${result.structuredContent.workspace.url}`},{type:'text',text:JSON.stringify(result.structuredContent)});
    }
    if(new TextEncoder().encode(JSON.stringify(result)).length>140000&&result.structuredContent?.phase?.answers){
      const phase=result.structuredContent.phase;
      phase.answerAccess={tool:'workshop_next',phase:phase.id,fields:Object.entries(phase.answers).map(([field,value])=>({field,items:Array.isArray(value)?value.length:null})),instruction:'This step is too detailed for one tool response. Read each listed scalar field using workshop_next with phase and field; for an array read each itemIndex from 0 through items minus 1. Assemble the complete saved wording before asking for approval. Stored answers were not shortened.'};
      phase.answers={};
      phase.question=null;phase.questionField=null;
      result.structuredContent.questionTurn={...result.structuredContent.questionTurn,hostAction:'read_saved_context',question:null,instruction:phase.answerAccess.instruction};
      result.structuredContent.next=phase.answerAccess.instruction;
      result.structuredContent.nextQuestion=null;
      result.content=[{type:'text',text:phase.answerAccess.instruction},{type:'text',text:JSON.stringify(result.structuredContent)}];
    }
    return result;
  };
  const preferred=async(key,mode)=>mode??await store.getPreference(key);
  const build=async(loaded,requested,mode,message='',purpose='conversation')=>{
    const {record,reference:ref}=loaded;
    const active=currentPhase(record)??6;
    const phaseId=requested??active;
    const guide=phaseGuide(record,phaseId);
    const preference=await preferred(ref.key,mode);
    const nextQuestion=nextConversationQuestion(record);
    const turn=questionTurn(record,nextQuestion,randomUUID(),purpose,preference);
    const summary=`Step ${phaseId}: ${guide.title} Saved revision ${record.revision}; ${record.phases[phaseId-1].status.replace('_',' ')}. Use phase.answers for the complete wording when presenting this step for approval.`;
    const readingKey=await readKeyFor(ref.key);
    const workspaceUrl=`${origin.origin}/workbook#${readingKey}`;
    const next=purpose==='files'?turn.instruction:[turn.instruction,nextQuestion.hint,nextQuestion.question].filter(Boolean).join('\n');
    return {content:[{type:'text',text:[message,summary,next].filter(Boolean).join('\n\n')}],structuredContent:{
      record:ref,currentRevision:loaded.currentRevision??record.revision,group:record.group,
      phase:{...guide,question:purpose==='files'||nextQuestion.kind!=='answer'?null:nextQuestion.question,questionField:purpose==='files'?null:nextQuestion.field,status:record.phases[phaseId-1].status,answers:record.phases[phaseId-1].answers,answerSchema:phaseSchemaFor(phaseId),instructions:teaching.split(/## Phase \d: /)[phaseId]?.split('\n## ')[0]??guide.instructions},
      context:{goal:record.phases[0].answers,tasks:phaseId>=4?record.phases[2].answers.tasks?.map(({id,actor,work})=>({id,actor,work})):undefined,candidates:phaseId===5?record.phases[3].answers.candidates:phaseId===6?record.phases[3].answers.candidates?.map(({id,title,taskIds})=>({id,title,taskIds})):undefined,choices:phaseId===6?record.phases[4].answers.choices:undefined},
      progress:record.phases.map(p=>({id:p.id,status:p.status})),summary,mode:preference==='text'||!capability()?'text':'ui-available',next,hostingGuide:hostGuide,completeness:phaseReadiness(record,phaseId),questionTurn:turn,nextQuestion:purpose==='files'?null:nextQuestion,
      view:{phaseId,readOnly:true,recordRevision:record.revision},workspace:{url:workspaceUrl,retention:'Until explicit deletion',access:'Anyone with this link can read and download; it cannot edit.'},
    },_meta:{workbook:record}};
  };
  const load=ref=>store.load(ref.key);
  const renderPdf=async record=>{
    const bytes=await pdfRenderer(record);
    if(!Buffer.isBuffer(bytes)||bytes.subarray(0,5).toString()!=='%PDF-'||bytes.length>5_000_000)throw new Error('The PDF service did not return a valid classroom-sized PDF.');
    return bytes;
  };
  const files=async(loaded,result,revision=loaded.record.revision)=>{
    const snapshot=revision===loaded.record.revision?loaded:await store.load(loaded.reference.key,revision);
    let urls={revision};
    try {
      const json=await store.createFileTicket(loaded.reference.key,revision,'json');
      urls={revision,jsonUrl:`${origin.origin}/files/${json.ticket}`,expiresAt:json.expiresAt};
      if(!snapshot.record.phases.some(p=>p.status!=='draft'))throw new Error('Approve the first step before generating a PDF. The saved draft is still available.');
      const bytes=await renderPdf(snapshot.record);
      const pdf=await store.createFileTicket(loaded.reference.key,revision,'pdf');
      result.structuredContent.export={...urls,status:'ready',pdfUrl:`${origin.origin}/files/${pdf.ticket}`,name:`our-ai-use-case-portfolio-r${revision}.pdf`,bytes:bytes.length};
      result.content[0].text+=`\n\n[Download the PDF for revision ${revision}](${result.structuredContent.export.pdfUrl})\n[Download its saved record](${urls.jsonUrl})\n[Open the permanently saved workbook](${result.structuredContent.workspace.url})\nThese file links last 15 minutes; the saved workbook does not expire. Request fresh links whenever needed.`;
    }catch {
      result.structuredContent.export={...urls,status:'failed',message:'The PDF or temporary file links could not be prepared. Saved answers and approvals are retained.',retryTool:'export_workbook'};
      result.content[0].text+=`\n\nThe saved answers and approvals are retained. File preparation failed; retry export_workbook without approving again, or [open the saved workbook](${result.structuredContent.workspace.url}) for direct downloads.`;
    }
    return result;
  };
  const operation=async(ref,type,args,reducer)=>{
    ensureWrite();
    const {requestId:chosen,...payload}=args;
    const operationHash=await hashValue(canonicalJson({type,...payload}));
    const operationId=chosen??`${type}:${ref.revision}:${operationHash}`;
    return store.transact(ref,{operationId,operationHash},before=>{
      let after;
      try {after=reducer(before);}catch(error){if(!(error instanceof z.ZodError))error.safeMessage=error.message;throw error;}
      if(after.revision!==before.revision)after.revision=before.revision+1;
      return validateRecord(after);
    });
  };
  const safe=(handler,visual)=>async args=>{
    try {const result=await handler(args);if(result.structuredContent?.view)result.structuredContent.view.display=visual;return finish(result);}
    catch(error) {
      // Database errors can contain SQL and parameters. Only validation/domain
      // errors are safe to show; adapter errors use a deliberately small code set.
      const known=error instanceof SessionError;
      const validation=error instanceof z.ZodError;
      const message=known?`${error.message} (${error.code}) Load the saved workbook and retry only the intended change.`:validation?'The answer does not match this step. Repair the tool arguments using the saved wording and answer schema. Do not ask the group for JSON.':error?.safeMessage??'The request did not complete. Your saved workbook is retained. Load the current step and retry.';
      try {
        reference.parse(args.record);
        const result=await build(await load(args.record),args.phase,args.mode,message);
        result.isError=true;result.structuredContent.error={code:known?error.code:'INVALID_REQUEST',message};result.structuredContent.view.display=false;
        return finish(result);
      } catch {return {isError:true,content:[{type:'text',text:message}]};}
    }
  };
  const register=(name,description,schema,handler,{visual=false,write=false,destructive=false,idempotent=true}={})=>server.registerTool(name,{
    description:`${description} ${hostGuide}`,
    inputSchema:schema,outputSchema:anyObject,annotations:{readOnlyHint:!write,destructiveHint:destructive,idempotentHint:!destructive&&idempotent,openWorldHint:false},...(visual?{_meta:uiMeta}:{})
  },safe(handler,visual));
  const input={record:reference,mode:modeSchema};
  for(const [name,uri,path] of [['Workshop method','workshop://method','skills/ai-use-case-workshop/SKILL.md'],['Host instructions','workshop://host-contract','skills/ai-use-case-workshop/references/host-contract.md'],['Phase guidance','workshop://phases','skills/ai-use-case-workshop/references/phases.md'],['Workbook design','workshop://design','skills/ai-use-case-workshop/assets/DESIGN.md'],['Method foundations','workshop://foundations','skills/ai-use-case-workshop/references/foundations.md']])server.registerResource(name,uri,{mimeType:'text/markdown'},async url=>({contents:[{uri:url.href,mimeType:'text/markdown',text:await file(path)}]}));
  server.registerResource('Visual workbook snapshot',uiUri,{mimeType:RESOURCE_MIME_TYPE},async url=>({contents:[{uri:url.href,mimeType:RESOURCE_MIME_TYPE,text:await file('dist/widget.html'),_meta:{ui:{prefersBorder:false,csp:{connectDomains:[],resourceDomains:[]}}}}]}));
  server.registerPrompt('ai_use_case_workshop',{description:'Start a privately saved six-step group workshop.',argsSchema:z.object({problem:z.string().max(400).optional()})},({problem})=>({messages:[{role:'user',content:{type:'text',text:`${retention}\n${hostGuide}\n${problem?`Group-supplied problem: ${JSON.stringify(problem)}`:'Ask for group name, member first names or aliases, date and one problem.'}`}}]}));

  register('start_workshop',`Start a persistent private group workbook. First call without record to prepare a private reference; no group data is stored yet. Explain storage to the group: ${retention} Then repeat with the returned record and group details. Do not prepare another reference after activation errors.`,z.object({record:reference.optional(),group:groupSchema.optional(),mode:modeSchema}),async args=>{
    ensureWrite();
    if(!args.record)return {content:[{type:'text',text:`${retention}\nKeep this private reference. Call start_workshop again with it and the supplied group details; no group data has been stored yet.`}],structuredContent:{record:await store.prepare(),pending:true,retention}};
    const loaded=await store.activate(args.record,groupSchema.parse(args.group));
    if(args.mode&&!loaded.replayed)await store.setPreference(loaded.reference,args.mode);
    const result=await build(loaded,undefined,loaded.replayed?undefined:args.mode,retention);
    result.structuredContent.pending=false;return result;
  },{write:true,idempotent:false});
  register('workshop_next','Read the latest saved workbook using only its private reference. Optional phase loads wording for an earlier correction. For a long step, field and itemIndex read one saved field or array item; read every listed item before presenting a complete approval summary. Do not reconstruct the full record.',z.object({...input,phase:phaseNumber.optional(),field:z.string().max(40).optional(),itemIndex:z.number().int().min(0).max(5).optional()}),async args=>{
    const loaded=await load(args.record),result=await build(loaded,args.phase,args.mode);
    if(args.field!==undefined){
      const value=result.structuredContent.phase.answers[args.field];
      if(value===undefined)throw Object.assign(new Error('Field unavailable.'),{safeMessage:'That field is not recorded in this step. Read the step context and use its listed field names.'});
      if(args.itemIndex!==undefined&&(!Array.isArray(value)||args.itemIndex>=value.length))throw Object.assign(new Error('Item unavailable.'),{safeMessage:'That saved array item is unavailable. Use the item count in answerAccess.'});
      result.structuredContent.phase.answers={[args.field]:args.itemIndex===undefined?value:[value[args.itemIndex]]};
      result.structuredContent.phase.answerWindow={field:args.field,itemIndex:args.itemIndex??null,totalItems:Array.isArray(value)?value.length:null,complete:false};
      result.structuredContent.phase.question=null;result.structuredContent.phase.questionField=null;
      result.structuredContent.questionTurn={...result.structuredContent.questionTurn,hostAction:'read_saved_context',question:null,instruction:'This is a partial context read. Gather the remaining saved fields/items before presenting the complete step for approval. Do not ask a duplicate question.'};
      result.structuredContent.next=result.structuredContent.questionTurn.instruction;result.structuredContent.nextQuestion=null;
    }else if(args.itemIndex!==undefined)throw new Error('Specify the recorded field for an item read.');
    return result;
  });
  register('resume_workshop','Resume the latest stored workbook in a new chat using its private reference. An old revision is allowed for this read; it returns the actual latest position. No expiry or JSON reconstruction.',z.object(input),async args=>build(await load(args.record),undefined,args.mode,'This is the latest saved workbook. Its earlier answers and approvals have been retained.'));
  register('set_workshop_preference','Remember whether this group wants native question cards where available (auto) or ordinary chat (text). This changes presentation only, not answers or approval.',z.object({record:reference,mode:z.enum(['auto','text'])}),async args=>{ensureWrite();const loaded=await store.setPreference(args.record,args.mode);return build(loaded,undefined,args.mode);},{write:true});
  register('present_workshop_question','Prepare one focused question with grounded proposed choices. The host asks through its native question tool, or ordinary chat. No embedded form, answer save or approval.',z.object({...input,presentation:presentationSchema}),async args=>{
    const loaded=await load(args.record),question=validatePresentation(loaded.record,args.presentation),result=await build(loaded,question.phaseId,args.mode);
    const next={kind:'answer',field:question.field,question:question.question,hint:question.hint??'',choices:question.choices};
    result.structuredContent.presentation=question;result.structuredContent.nextQuestion=next;
    result.structuredContent.questionTurn=questionTurn(loaded.record,next,randomUUID(),'conversation',await preferred(args.record.key,args.mode));
    result.structuredContent.next=`${result.structuredContent.questionTurn.instruction}\n${question.question}`;
    result.content[0].text=result.structuredContent.next;return result;
  });
  register('save_workshop_phase','Save only agreed changes against the current revision. Unspecified wording is retained. Use arrayEdits for one candidate/task/choice or blocker correction. An explicit remove/replace requires the group to request it. Earlier corrections retain later work for review. Does not approve.',z.object({...input,phase:phaseNumber,answers:answerPatch.default({}),arrayEdits:z.array(arrayEdit).max(12).optional(),group:groupPatch.optional(),requestId}),async args=>{
    let changedFields=[];
    const loaded=await operation(args.record,'save',args,before=>{
      const patch=patchArrays(before,args.phase,args.answers,args.arrayEdits);
      if(args.phase===6&&(patch.decision??before.phases[5].answers.decision)==='Do not pilot yet')patch.candidateId=null;
      const after=savePhase(before,args.phase,patch,args.group);
      changedFields=Object.keys(after.phases[args.phase-1].answers).filter(k=>!sameValue(before.phases[args.phase-1].answers[k],after.phases[args.phase-1].answers[k]));
      return after;
    });
    const result=await build(loaded,args.phase,args.mode);
    result.structuredContent.saveReceipt={status:loaded.replayed?'replayed':loaded.appliedRevision===args.record.revision?'unchanged':'saved',appliedRevision:loaded.appliedRevision,currentRevision:loaded.record.revision,changedFields,readyForApproval:phaseReadiness(loaded.record,args.phase).complete};return result;
  },{write:true});
  register('workshop_action','Save a specific group decision with a short record reference and matching expectedRevision. Intermediate selections do not approve a step.',z.object({...input,action:actionSchema,requestId}),async args=>build(await operation(args.record,'action',args,before=>{
    if(args.action.kind==='set_answer')patchArrays(before,args.action.phaseId,{[args.action.field]:args.action.value});
    return applyWorkshopAction(before,args.action);
  }),args.action.phaseId,args.mode),{write:true});
  register('show_workbook','Display a read-only saved visual. Optional phase shows an earlier chapter; optional revision shows an immutable historical snapshot. It never changes progress or asks an embedded question.',z.object({...input,phase:phaseNumber.optional(),revision:z.number().int().nonnegative().optional()}),async args=>build(await store.load(args.record.key,args.revision),args.phase,args.mode),{visual:true});
  register('show_shortlist','Display the saved candidate comparison. Collect questions and decisions only in host chat.',z.object(input),async args=>build(await load(args.record),5,args.mode),{visual:true});
  register('confirm_workshop_phase','Only after explicit group approval of the saved summary: quote the approval and set approved true. Save approval durably before PDF generation. Retries with the same requestId and payload never repeat approval. PDF failure does not lose approval.',z.object({...input,phase:phaseNumber,approved:z.literal(true),confirmation:z.string().trim().min(1).max(1200),requestId}),async args=>{
    const loaded=await operation(args.record,'confirm',args,before=>confirmPhase(before,args.phase,args.confirmation));
    const later=loaded.record.revision>loaded.appliedRevision;
    const message=later?`The original approval was saved at revision ${loaded.appliedRevision}. The workbook now has revision ${loaded.record.revision}; use the displayed current statuses when continuing. The attached PDF represents the original approval revision.`:`Step ${args.phase} is approved and saved at revision ${loaded.appliedRevision}.`;
    const result=await build(loaded,args.phase,args.mode,message);
    result.structuredContent.saveReceipt={status:loaded.replayed?'replayed':'saved',appliedRevision:loaded.appliedRevision,currentRevision:loaded.record.revision};
    return files(loaded,result,loaded.appliedRevision);
  },{visual:true,write:true});
  register('export_workbook','Provide actual HTTPS PDF and saved-record download links without restarting questions. Uses latest stored revision unless an explicit snapshot revision is requested. The workbook remains saved; only temporary file links expire.',z.object({...input,revision:z.number().int().nonnegative().optional()}),async args=>{
    const loaded=await store.load(args.record.key,args.revision);
    return files(loaded,await build(loaded,undefined,args.mode,'','files'));
  },{visual:true});
  register('workshop_history','Read revision numbers and save times for this private workbook. Use show_workbook or export_workbook with a revision to read an older version.',z.object({record:reference}),async args=>({content:[{type:'text',text:'Saved revisions are read-only. Opening one does not restore or overwrite current work.'}],structuredContent:{record:(await load(args.record)).reference,history:await store.history(args.record.key)}}));
  register('delete_workshop','Permanently remove this group workbook, saved revision history and download tickets from the application only when the group explicitly requests deletion. Requires the current revision, confirmed true and exact groupName. Downloaded files, chat copies and provider backups are outside this operation.',z.object({record:reference,confirmed:z.literal(true),groupName:z.string().max(120)}),async args=>{
    ensureWrite();const loaded=await load(args.record);
    if(args.groupName!==loaded.record.group.name)throw new Error('The group name does not match.');
    await store.remove(args.record);
    return {content:[{type:'text',text:'The workbook, revision history and file tickets were deleted from the application. Old access links no longer work. Previously downloaded files, chat copies and provider backups are not erased by this action.'}],structuredContent:{deleted:true}};
  },{write:true,destructive:true});
  register('import_workshop','Explicitly import an existing group-provided version-1 JSON backup into a newly prepared private reference. Ask the group before importing. Never use this to overwrite an existing active workbook or invent lost history.',z.object({record:reference,checkpoint:recordSchema,approved:z.literal(true),mode:modeSchema}),async args=>{
    ensureWrite();const checkpoint=validateRecord(args.checkpoint);
    await store.activate(args.record,checkpoint.group);
    const loaded=await operation({...args.record,revision:0},'import',{checkpoint},before=>{
      if(before.revision!==0||before.phases.some(p=>Object.keys(p.answers).length))throw new Error('Import requires a newly prepared workbook.');
      return {...checkpoint,revision:1};
    });
    if(args.mode&&!loaded.replayed)await store.setPreference(loaded.reference,args.mode);
    return build(loaded,undefined,loaded.replayed?undefined:args.mode,'The group-provided backup was imported. Existing approvals come from that backup; confirm that it is the version your group intended.');
  },{write:true});
  // Retained for native App download support. Ordinary chat uses HTTPS links.
  server.registerTool('download_workbook_file',{description:'Return a compressed PDF for the exact saved snapshot named by the record revision. File-only result; no questions or changes. Ordinary chat should use export_workbook for HTTPS links.',inputSchema:z.object({record:reference}),annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async args=>{
    try {
      const {record}=await store.load(args.record.key,args.record.revision);
      if(!record.phases.some(p=>p.status!=='draft'))throw new Error('Approve the first step before exporting a PDF.');
      const pdf=await renderPdf(record),name=`our-ai-use-case-portfolio-r${record.revision}.pdf`;
      const result={content:[{type:'text',text:'Deliver the attached compressed PDF through the host file controls.'},{type:'resource',resource:{uri:`workbook://exports/${name}.gz`,mimeType:'application/gzip',blob:gzipSync(pdf,{level:9}).toString('base64')}}],structuredContent:{export:{status:'ready',revision:record.revision,name,mimeType:'application/pdf',encoding:'gzip',bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex')}}};
      if(JSON.stringify(result).length>140000)throw new Error('Use normal HTTPS file links for this workbook.');return finish(result);
    }catch{return {isError:true,content:[{type:'text',text:'The file was not delivered. Use export_workbook for a fresh HTTPS PDF link; the saved workbook is unchanged.'}]};}
  });
  return server;
}
