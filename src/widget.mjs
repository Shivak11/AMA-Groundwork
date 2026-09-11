import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { validateRecord, answerSchemas, readableSummary } from './workshop.mjs';
import { createActivity, el, control, titles, shortTitles } from './activity-view.mjs';

const app = new App({ name: 'AI Use-Case Workshop activities', version: '0.2.0' }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: true });
const root = document.getElementById('workshop-root');
let current = null, metadata = {}, capabilities = {}, host = {};
let connected = false, pending = false, contextBlocked = false;
let recordConflict = null;
let generation = 0, displayedPhase = 1, panel = 'activity';
let noticeText = 'Connecting to the conversation.', noticeError = false;
const phaseState = Array.from({ length: 6 }, () => ({}));
const activePhase = record => record.phases.find(phase => phase.status !== 'confirmed')?.id ?? 6;
// Version 1 has no immutable group ID. Changed identifying details require a
// participant decision; an action response cannot change any group metadata.
const sameGroupDetails = (a, b) => a.group.name === b.group.name && a.group.date === b.group.date;
const sameRecord = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errorText = result => (result?.content ?? []).filter(item => item.type === 'text').map(item => item.text).join('\n').slice(0, 1500);
const supports = key => Boolean(capabilities[key]);
const disclosureState = new Map();

function disclosureKey(node) {
  const activity = node.closest('#activity-panel');
  const scope = activity ? `phase-${activity.querySelector('.activity')?.dataset.phase}` : node.closest('.sync-recovery') ? 'recovery' : 'book';
  const owner = node.closest('[data-candidate-id]')?.dataset.candidateId || node.closest('[data-task-id]')?.dataset.taskId || '';
  return `${scope}:${owner}:${node.querySelector(':scope > summary')?.textContent}`;
}
function captureDisclosures() { root.querySelectorAll('details').forEach(node => disclosureState.set(disclosureKey(node), node.open)); }
function restoreDisclosures() { root.querySelectorAll('details').forEach(node => { const open = disclosureState.get(disclosureKey(node)); if (open !== undefined) node.open = open; }); }

function showNotice(text, error = false) {
  noticeText = text; noticeError = error;
  const node = root.querySelector('#activity-notice');
  if (node) { node.textContent = text; node.classList.toggle('error', error); node.setAttribute('role', error ? 'alert' : 'status'); node.hidden = !text; }
}
function updateControls() {
  const readOnly = current && displayedPhase > activePhase(current.record);
  const dirty = current && Object.entries(phaseState[displayedPhase - 1].editors ?? {}).some(([field, draft]) => draft.value.trim() !== (current.record.phases[displayedPhase - 1].answers[field] ?? ''));
  root.setAttribute('aria-busy', String(pending));
  root.querySelectorAll('[data-mutation]').forEach(node => { node.disabled = Boolean(node.dataset.intrinsicDisabled || (node.dataset.approval && dirty) || !connected || pending || contextBlocked || recordConflict || readOnly || !supports('serverTools') || !supports('updateModelContext')); });
  const draftNote = root.querySelector('#unsaved-approval-note'); if (draftNote) draftNote.hidden = !dirty;
  root.querySelectorAll('[data-chat]').forEach(node => { node.disabled = Boolean(!connected || pending || contextBlocked || recordConflict || !supports('message')); });
  root.querySelectorAll('[data-operation]').forEach(node => { node.disabled = Boolean(!connected || pending || node.dataset.intrinsicDisabled); });
  root.querySelectorAll('[data-sync]').forEach(node => { node.disabled = !connected || pending; });
}
function operation(label, handler, options = {}) { const button = control(label, handler, options); button.dataset.operation = 'true'; return button; }
function chatButton(label, prompt, options = {}) { const button = control(label, () => ask(prompt), options); button.dataset.chat = 'true'; return button; }
function parsedResult(result) {
  if (!result || result.isError) throw new Error(errorText(result) || 'The requested change was not accepted.');
  const data = result.structuredContent;
  try { return { ...data, record: validateRecord(data?.record) }; }
  catch { throw new Error('The connector did not return a complete valid group record. Your previous record remains in this view.'); }
}
function holdRecord(result, kind) {
  recordConflict = { result, kind }; generation += 1; pending = false;
  showNotice(kind === 'details' ? 'The group details changed. Confirm that the incoming record belongs to this group before continuing.' : 'Two different records have the same revision. Changes are paused until your group chooses which record to use.', true);
  render(); throw new Error(noticeText);
}
function setResult(result, { requestRecord, allowSame = false, fromHost = false } = {}) {
  const data = parsedResult(result);
  if (requestRecord && JSON.stringify(requestRecord.group) !== JSON.stringify(data.record.group)) throw new Error('An action reply unexpectedly changed the group details. It was not adopted; your previous record remains in this view.');
  if (current) {
    if (data.record.revision < current.record.revision) throw new Error('An older reply arrived and was ignored. The newer group record is still shown.');
    if (data.record.revision === current.record.revision && !sameRecord(data.record, current.record)) holdRecord(result, 'revision');
    if (fromHost && !sameGroupDetails(current.record, data.record)) holdRecord(result, 'details');
  }
  if (requestRecord && data.record.revision < requestRecord.revision + (allowSame ? 0 : 1)) throw new Error('The reply did not contain an updated record. Your previous record is still shown.');
  const advanced = !current || activePhase(data.record) !== activePhase(current.record);
  current = data; metadata = result._meta ?? {};
  if (advanced) displayedPhase = activePhase(data.record);
  // Merely receiving an echo cannot prove that updateModelContext succeeded.
  if (fromHost) { generation += 1; pending = false; }
  return data;
}
async function syncContext(token = generation) {
  const payload = current; contextBlocked = true; updateControls();
  if (!supports('updateModelContext')) return false;
  try {
    const result = await app.updateModelContext({ content: [{ type: 'text', text: `The group’s latest complete workshop record is revision ${payload.record.revision}. Use this returned record for the next turn. Visual selections are not phase approval. Ask only for missing reasoning; do not replace existing answers.` }], structuredContent: payload }, { timeout: 15000 });
    if (token !== generation) return false;
    if (result?.isError) throw new Error('denied');
    contextBlocked = false; return true;
  } catch { if (token === generation) contextBlocked = true; return false; }
}
async function callTool(name, args, { allowSame = false, success = 'Your change is saved in the group record.', phaseId, committedField } = {}) {
  if (!connected || pending || contextBlocked || recordConflict || !current) return;
  if (!supports('serverTools') || !supports('updateModelContext')) { showNotice('This host cannot save and share visual choices. Continue with the same exercise in the conversation.', true); return; }
  const requestRecord = current.record, token = ++generation;
  pending = true; updateControls(); showNotice('Saving your group’s choice…');
  try {
    const result = await app.callServerTool({ name, arguments: args }, { timeout: name === 'workshop_action' ? 20000 : 90000 });
    if (token !== generation) return;
    setResult(result, { requestRecord, allowSame });
    if (committedField) {
      const drafts = phaseState[phaseId - 1].editors;
      if (drafts?.[committedField.field]?.value.trim() === committedField.value) delete drafts[committedField.field];
    }
    if (phaseId && name === 'workshop_action') displayedPhase = phaseId;
    const synced = await syncContext(token);
    if (token !== generation) return;
    pending = false; render();
    if (!synced) showNotice('The change was saved, but the conversation did not receive the latest record. Retry sharing below before making another change. You can still download the JSON backup.', true);
    else if (current.export?.status === 'failed') showNotice('Your approval is recorded. The PDF could not be created; retry it from Our book. You do not need to approve again.', true);
    else showNotice(success);
  } catch (error) {
    if (token !== generation) return;
    pending = false; showNotice(error.message || 'The change could not be saved. Your previous record remains available.', true); updateControls();
  }
}
function applyAction(action) { return callTool('workshop_action', { record: current.record, action }, { phaseId: action.phaseId, allowSame: true, committedField: action.kind === 'set_answer' ? { field: action.field, value: action.value } : null }); }
async function retryContext() {
  if (!current || !connected || pending || recordConflict) return;
  pending = true; updateControls(); const token = generation;
  const synced = await syncContext(token);
  if (token !== generation) return;
  pending = false; render(); showNotice(synced ? 'The conversation now has the latest complete record. You can continue.' : 'The conversation still could not receive the record. Download the JSON backup and ask to restore it in chat.', !synced);
}
async function resolveRecordConflict(useIncoming) {
  if (!recordConflict || !connected || pending) return;
  const candidate = recordConflict.result;
  if (useIncoming) { current = parsedResult(candidate); metadata = candidate._meta ?? {}; displayedPhase = activePhase(current.record); }
  recordConflict = null; contextBlocked = true; pending = true; const token = ++generation;
  render(); showNotice('Sharing the record your group chose with the conversation…');
  const synced = await syncContext(token);
  if (token !== generation) return;
  pending = false; render();
  showNotice(synced ? 'The selected record is shared. Unsaved wording remains a draft until you save it.' : 'Your selected record is retained, but sharing failed. Retry sharing before making another change.', !synced);
}
function conflictPanel() {
  const incoming = parsedResult(recordConflict.result).record, detailsChanged = recordConflict.kind === 'details';
  const section = el('section', undefined, 'sync-recovery'); section.id = 'record-conflict';
  section.append(el('h2', detailsChanged ? 'Confirm the updated group details' : 'Choose which saved record to continue'));
  section.append(el('p', detailsChanged ? 'This record has no permanent group ID. Confirm only if these are updated details for your group. For a different group, open its own conversation and view.' : 'Both records use the same revision, so the view cannot decide which is correct. Review the wording before choosing. No change will be saved until the selected record is shared successfully.'));
  for (const [label, record] of [['This view', current.record], ['Incoming record', incoming]]) {
    const summary = el('details'); summary.append(el('summary', `${label}: ${record.group.name}, ${record.group.date}`), el('p', `Members: ${record.group.members.join(', ')}. Problem: ${record.group.problem}`), el('p', readableSummary(record, activePhase(record)), 'full-wording')); section.append(summary);
  }
  section.append(operation('Keep this view’s record', () => resolveRecordConflict(false)), operation(detailsChanged ? 'Use updated details for our group' : 'Use the conversation’s record', () => resolveRecordConflict(true)), technicalDetails(current.record)); return section;
}
async function ask(prompt) {
  if (!current || pending || contextBlocked || recordConflict || !connected) return;
  if (!supports('message')) { showNotice(`Continue in the conversation: ${prompt}`, true); return; }
  const token = generation; pending = true; updateControls();
  try {
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: `Group ${JSON.stringify(current.record.group.name)}, record revision ${current.record.revision}. Use the latest complete record shared by the workshop view; if a newer record exists, reconcile it before saving. ${prompt}` }] }, { timeout: 15000 });
    if (token !== generation) return;
    if (result?.isError) throw new Error('denied');
    showNotice('Your question was sent. Continue in the conversation.');
  } catch { if (token === generation) showNotice(`The question could not be sent. Ask in the conversation: ${prompt}`, true); }
  finally { if (token === generation) { pending = false; updateControls(); } }
}
const filePrompt = 'Show the existing workbook PDF and JSON backup links from this result. Do not call export_workbook again merely to retrieve an existing file. If no PDF is available, explain that and ask whether to create it.';
async function download(kind) {
  if (!current || !connected || pending) return;
  if (!supports('downloadFile')) {
    if (contextBlocked || recordConflict) { showNotice('The host cannot download from this view. Copy the complete JSON record below and restore it in the conversation before continuing.', true); root.querySelector('#record-backup')?.setAttribute('open', ''); return; }
    return ask(filePrompt);
  }
  const isPdf = kind === 'pdf'; const file = metadata.artifacts?.[kind] ?? (!isPdf ? { name: `workshop-revision-${current.record.revision}.json`, text: JSON.stringify(current.record, null, 2) } : null);
  if (!file || (isPdf && typeof file.blob !== 'string') || (!isPdf && typeof file.text !== 'string')) { showNotice('This revision has no PDF yet. Use Create workbook PDF in Our book.', true); return; }
  const name = String(file.name || (isPdf ? 'our-ai-use-case-portfolio.pdf' : 'workshop-record.json')).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 160);
  const resource = { uri: `file:///${encodeURIComponent(name)}`, mimeType: isPdf ? 'application/pdf' : 'application/json', ...(isPdf ? { blob: file.blob } : { text: file.text }) };
  const token = generation; pending = true; updateControls();
  try {
    const result = await app.downloadFile({ contents: [{ type: 'resource', resource }] }, { timeout: 30000 });
    if (token !== generation) return;
    showNotice(result?.isError ? 'The download was declined or cancelled. Try again or request the file links in the conversation.' : 'The host accepted the download request. Check its files area or download prompt.', Boolean(result?.isError));
  } catch { if (token === generation) showNotice('The download could not be completed. Request the existing file links in the conversation, or copy the JSON backup below.', true); }
  finally { if (token === generation) { pending = false; updateControls(); } }
}
async function changeDisplayMode() {
  if (!connected || pending) return;
  const mode = host.displayMode === 'fullscreen' ? 'inline' : 'fullscreen';
  if (!host.availableDisplayModes?.includes(mode)) return;
  try { const result = await app.requestDisplayMode({ mode }); host.displayMode = result.mode; render(); }
  catch { showNotice('This host did not change the display mode. The activity and book remain available here.', true); }
}
function confirmationPanel(record, phaseId) {
  const section = el('details', undefined, 'approval-review'); section.append(el('summary', `Review and approve Step ${phaseId}`));
  section.append(el('p', readableSummary(record, phaseId), 'full-wording'));
  const draftNote = el('p', 'Save or cancel your unsaved wording before approving this chapter.', 'phase-note'); draftNote.id = 'unsaved-approval-note'; section.append(draftNote);
  const label = el('label', undefined, 'approval-check'), checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.dataset.mutation = 'true';
  label.append(checkbox, el('span', 'Our group approves this saved summary.')); section.append(label);
  const confirm = control('Confirm and add chapter', () => {
    if (!checkbox.checked) return;
    callTool('confirm_workshop_phase', { record: current.record, phase: phaseId, approved: true, confirmation: `Our group approves the saved Step ${phaseId} summary in record revision ${current.record.revision}.` }, { success: `Step ${phaseId} is approved. Its chapter is in Our book.` });
  }, { mutation: true, disabled: true, className: 'primary' });
  confirm.dataset.approval = 'true';
  checkbox.addEventListener('change', () => { if (checkbox.checked) delete confirm.dataset.intrinsicDisabled; else confirm.dataset.intrinsicDisabled = 'true'; updateControls(); }); section.append(confirm); return section;
}
function technicalDetails(record) {
  const section = el('details', undefined, 'technical-details'); section.append(el('summary', 'Backup and record details'));
  section.append(el('p', `${record.group.name} · record revision ${record.revision}`), el('p', 'This record travels in the group conversation. Download a JSON backup before changing clients. No account database or automatic cross-client recovery is provided.'));
  const controls = el('div', undefined, 'controls'); controls.append(operation('Download JSON backup', () => download('checkpoint'))); section.append(controls);
  const backup = el('details'); backup.id = 'record-backup'; backup.append(el('summary', 'Show the complete JSON record'));
  const input = el('textarea'); input.readOnly = true; input.value = JSON.stringify(record, null, 2); input.setAttribute('aria-label', 'Complete JSON record'); input.rows = 8; input.addEventListener('focus', () => input.select()); backup.append(input); section.append(backup); return section;
}
function bookPanel(record, existing) {
  const book = existing ?? el('section', undefined, 'book-panel'); book.id = 'book-panel'; book.setAttribute('aria-label', 'Growing workbook');
  const retainedFrame = book._bookHtml === metadata.bookHtml ? book.querySelector('.book-frame') : null;
  if (retainedFrame) [...book.children].forEach(child => { if (child !== retainedFrame) child.remove(); });
  else book.replaceChildren();
  const prefix = document.createDocumentFragment();
  const count = record.phases.filter(phase => phase.status === 'confirmed').length;
  const heading = el('div', undefined, 'book-heading'); heading.append(el('h2', 'Our book'), el('p', `${count} of 6 chapters approved`)); prefix.append(heading);
  if (current.export?.status === 'failed') prefix.append(el('p', 'The approval is saved. PDF export failed and can be retried without approving again.', 'export-failure'));
  const files = el('div', undefined, 'controls');
  if (metadata.artifacts?.pdf) files.append(operation('Download workbook PDF', () => download('pdf'), { className: 'primary' }));
  else if (record.phases.some(phase => phase.status !== 'draft')) files.append(control(current.export?.status === 'failed' ? 'Retry workbook PDF' : 'Create workbook PDF', () => callTool('export_workbook', { record: current.record }, { allowSame: true, success: 'The workbook PDF is ready.' }), { mutation: true, className: 'primary' }));
  if (!contextBlocked) files.append(chatButton('Show file links in chat', filePrompt)); prefix.append(files); book.insertBefore(prefix, retainedFrame);
  if (typeof metadata.bookHtml === 'string' && metadata.bookHtml.trim()) {
    if (!retainedFrame) { const frame = el('iframe'); frame.title = 'Your growing AI use-case workbook'; frame.setAttribute('sandbox', ''); frame.referrerPolicy = 'no-referrer'; frame.srcdoc = metadata.bookHtml; frame.className = 'book-frame'; book.append(frame); }
  } else {
    const preview = el('div', undefined, 'book-text-preview'); preview.append(el('h2', record.group.problem), el('p', record.group.name), el('p', record.group.members.join(', ')));
    record.phases.filter(phase => phase.status !== 'draft').forEach(phase => { const chapter = el('section'); chapter.append(el('h3', `Step ${phase.id}. ${titles[phase.id - 1]}`)); if (phase.status === 'needs_review') chapter.append(el('p', 'Needs group review.')); chapter.append(el('p', readableSummary(record, phase.id), 'full-wording')); preview.append(chapter); });
    if (!count) preview.append(el('p', 'Your approved chapters will appear here. The active draft stays in the activity.')); book.append(preview);
  }
  book._bookHtml = metadata.bookHtml;
  book.append(technicalDetails(record)); return book;
}
function render() {
  captureDisclosures();
  const priorWorkspace = current ? root.querySelector('.workspace') : null;
  if (priorWorkspace) [...root.children].forEach(child => { if (child !== priorWorkspace) child.remove(); });
  else root.replaceChildren();
  const notice = el('p', noticeText, `notice${noticeError ? ' error' : ''}`); notice.id = 'activity-notice'; notice.setAttribute('role', noticeError ? 'alert' : 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = !noticeText;
  if (!current) { root.append(el('h1', 'Your group’s AI use cases'), notice, el('p', 'If the view cannot connect, continue in the conversation. The same exercise and workbook remain available there.')); return; }
  const record = current.record, active = activePhase(record), phase = record.phases[displayedPhase - 1];
  const top = el('div', undefined, 'view-switcher'); top.setAttribute('role', 'group'); top.setAttribute('aria-label', 'Activity and book views');
  [['activity', 'Activity'], ['book', 'Our book'], ['split', 'Side by side']].forEach(([value, label]) => top.append(control(label, () => { panel = value; render(); }, { pressed: panel === value, className: value === 'split' ? 'split-toggle' : '' })));
  if (host.availableDisplayModes?.includes(host.displayMode === 'fullscreen' ? 'inline' : 'fullscreen')) top.append(operation(host.displayMode === 'fullscreen' ? 'Return inline' : 'Expand view', changeDisplayMode, { className: 'expand-control' })); root.prepend(top, notice);
  if (recordConflict) root.insertBefore(conflictPanel(), priorWorkspace);
  if (contextBlocked && !recordConflict) {
    const recovery = el('section', undefined, 'sync-recovery'); recovery.append(el('h2', 'Share the saved record before continuing'));
    const retry = control('Retry sharing with the conversation', retryContext, { className: 'primary' }); retry.dataset.sync = 'true'; recovery.append(retry, operation('Download JSON backup', () => download('checkpoint')), technicalDetails(record)); root.insertBefore(recovery, priorWorkspace);
  }
  const workspace = priorWorkspace ?? el('div'); workspace.className = `workspace panel-${panel}`;
  const activityPanel = el('section', undefined, 'activity-panel'); activityPanel.id = 'activity-panel'; activityPanel.hidden = panel === 'book';
  const progress = el('nav', undefined, 'phase-progress'); progress.setAttribute('aria-label', 'Workshop steps');
  record.phases.forEach(item => {
    const hasAnswers = Object.keys(item.answers).length > 0;
    const button = control(`${item.id}. ${shortTitles[item.id - 1]}`, () => { displayedPhase = item.id; render(); }, { disabled: item.id > active && !hasAnswers, className: item.status === 'confirmed' ? 'approved-step' : item.status === 'needs_review' ? 'review-step' : '' });
    button.setAttribute('aria-label', `Step ${item.id}, ${shortTitles[item.id - 1]}, ${item.status.replaceAll('_', ' ')}`); if (displayedPhase === item.id) button.setAttribute('aria-current', 'step'); progress.append(button);
  }); activityPanel.append(progress, el('h1', titles[displayedPhase - 1]));
  if (phase.status === 'confirmed') activityPanel.append(el('p', 'This chapter is approved. Changing a choice reopens it and marks dependent chapters for review.', 'phase-note'));
  else if (phase.status === 'needs_review') activityPanel.append(el('p', 'An earlier answer changed. Your wording is retained; review it before approving this chapter again.', 'phase-note'));
  if (displayedPhase > active) activityPanel.append(el('p', `Review Step ${active} before changing this step.`, 'phase-note'));
  if (!supports('serverTools') || !supports('updateModelContext')) activityPanel.append(el('p', 'This host cannot save visual choices and share their complete record. Use the conversation to make changes; the diagrams remain readable.', 'phase-note'));
  const prompts = ['Connect the goal to evidence of improvement. Select any part to add or refine it.', 'Classify each recorded barrier. Information access and authority to decide are different problems.', 'Put the recorded work in order, then choose one task for the zero-second test.', 'Compare a recorded AI proposal with its simpler alternative before keeping it.', 'Place the candidates according to what is worth testing. Keep the reason and missing evidence visible.', 'Choose a bounded test or explain why no pilot is justified yet.']; activityPanel.append(el('p', prompts[displayedPhase - 1], 'activity-instruction'));
  activityPanel.append(createActivity({ record, phaseId: displayedPhase, onAction: applyAction, onAsk: ask, state: phaseState[displayedPhase - 1], refresh: render }));
  const undo = record.interaction?.undo, controls = el('div', undefined, 'activity-actions');
  if (undo) controls.append(control(`Undo: ${undo.label}`, () => applyAction({ kind: 'undo', phaseId: undo.phaseId, expectedRevision: record.revision }), { mutation: true }));
  controls.append(chatButton('Continue in the conversation', `Continue Step ${displayedPhase} from the latest record. Ask one focused question about what is missing. Do not change or approve answers automatically.`)); activityPanel.append(controls);
  const wording = el('details', undefined, 'wording'); wording.append(el('summary', 'Read the full saved wording'), el('p', readableSummary(record, displayedPhase), 'full-wording')); activityPanel.append(wording);
  const complete = answerSchemas[displayedPhase - 1].safeParse(phase.answers).success;
  const unresolved = (displayedPhase === 5 && Object.keys(record.interaction?.priorities ?? {}).length > 0) || (displayedPhase === 4 && Object.values(record.interaction?.candidateDispositions ?? {}).includes('Reconsider'));
  if (displayedPhase === active && phase.status !== 'confirmed' && complete && !unresolved) activityPanel.append(confirmationPanel(record, displayedPhase));
  else if (phase.status !== 'confirmed' && displayedPhase === active) activityPanel.append(el('p', 'The chapter can be approved once the required wording and reasoning are recorded.', 'approval-incomplete'));
  const priorActivity = workspace.querySelector('#activity-panel');
  if (priorActivity) priorActivity.replaceWith(activityPanel); else workspace.append(activityPanel);
  const priorBook = workspace.querySelector('#book-panel');
  const book = bookPanel(record, priorBook); book.hidden = panel === 'activity';
  if (!priorBook) workspace.append(book); if (!priorWorkspace) root.append(workspace);
  const footer = el('footer'), credit = el('a', 'Prepared by Dr. Shiva Kakkar'); credit.href = 'https://www.shivakakkar.com/'; credit.target = '_blank'; credit.rel = 'noreferrer noopener'; footer.append(credit); root.append(footer); restoreDisclosures(); updateControls();
}
function hostContext(context = {}) {
  const previousMode = host.displayMode, previousModes = JSON.stringify(host.availableDisplayModes);
  host = { ...host, ...context };
  if (context.theme) applyDocumentTheme(context.theme);
  document.documentElement.classList.toggle('dark', host.theme === 'dark');
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
  for (const side of ['top', 'right', 'bottom', 'left']) { const value = Number(host.safeAreaInsets?.[side]); document.documentElement.style.setProperty(`--safe-${side}`, Number.isFinite(value) && value >= 0 ? `${Math.min(value, 100)}px` : '0px'); }
  if (current && (previousMode !== host.displayMode || previousModes !== JSON.stringify(host.availableDisplayModes))) render();
}
app.ontoolresult = result => {
  // A host may echo the current tool result while an app-originated call runs.
  // It is not a newer owner and must not discard the accepted action's reply.
  try {
    const incoming = parsedResult(result);
    if (current && sameRecord(incoming.record, current.record) && (pending || contextBlocked || recordConflict)) return;
    if (recordConflict) { showNotice('Resolve the displayed record choice before accepting another update.', true); return; }
    setResult(result, { fromHost: true, allowSame: true });
    if (!contextBlocked) { noticeText = current.export?.status === 'failed' ? 'Your approval is recorded. Retry the PDF from Our book; no second approval is needed.' : ''; noticeError = current.export?.status === 'failed'; }
    render();
  }
  catch (error) { showNotice(error.message, true); updateControls(); }
};
app.onhostcontextchanged = hostContext;
app.ontoolcancelled = () => { generation += 1; pending = false; showNotice('The operation was cancelled. The last returned record remains available; check the conversation before retrying.', true); updateControls(); };
app.onclose = () => { connected = false; generation += 1; pending = false; showNotice('This view is disconnected. Continue from the latest group record in the conversation.', true); updateControls(); };
render();
root.addEventListener('input', updateControls);
root.addEventListener('click', updateControls);
app.connect().then(() => { connected = true; capabilities = app.getHostCapabilities() ?? {}; hostContext(app.getHostContext()); if (!current) showNotice('Waiting for the group’s workshop record.'); else render(); updateControls(); }).catch(() => { connected = false; showNotice('This host could not connect the activity. Continue the same exercise in the conversation and request your workbook there.', true); });
