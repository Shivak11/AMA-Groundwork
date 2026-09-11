import { useRef, useState } from 'react';
import type { InlineProps, Phase, WorkshopRecord } from './inline-types';
import { CompactVisual } from './compact-visual';

const titles = ['Goal and success measure', 'Information and decisions', 'Workflow and remaining delays', 'AI and non-AI options', 'Priorities and reasons', 'Recommendation and next check'];
const shortTitles = ['Goal', 'Context', 'Workflow', 'Options', 'Priorities', 'Next step'];
const statusLabel = (phase: Phase) => phase.status === 'confirmed' ? 'Approved' : phase.status === 'needs_review' ? 'Needs review' : Object.keys(phase.answers).length ? 'Draft' : 'Not started';
function progressState(phase: Phase, current: Phase | undefined) {
  if (phase.status === 'confirmed') return { key: 'approved', label: 'Approved' };
  if (phase.status === 'needs_review') return { key: 'review', label: 'Needs review' };
  if (phase.id === current?.id || Object.keys(phase.answers).length) return { key: 'active', label: 'In progress' };
  return { key: 'future', label: 'Not started' };
}
function snapshotState(phase: Phase, current: Phase | undefined) {
  if (!current) return 'All 6 steps approved';
  const next = `Step ${current.id} ${current.status === 'needs_review' ? 'needs review' : 'next'}`;
  if (phase.status === 'confirmed') return `Approved · ${next}`;
  if (phase.status === 'needs_review') return `Needs review${current.id === phase.id ? ' · Earlier answer changed' : ` · ${next}`}`;
  const state = Object.keys(phase.answers).length ? 'Draft saved' : 'Not started';
  return `${state} · ${current.id === phase.id ? 'Continue in chat' : next}`;
}
const labels: Record<string, string> = {
  outcome:'Outcome', kpi:'Success measure', baseline:'Baseline', guardrail:'What must not get worse', hypothesis:'Expected change',
  blockers:'Information and decision gaps', information:'Information needed', holder:'Who holds it', barrier:'Barrier', unlock:'Possible way forward', firstGap:'First gap to resolve',
  workflows:'Workflows considered', chosenWorkflow:'Chosen workflow', recentCase:'Case replayed', tasks:'Recorded tasks', id:'Reference', actor:'Who does it', work:'Work', friction:'Delay or rework',
  zeroSecond:'What remains if the task takes no time', redesign:'Proposed workflow change', candidates:'Use-case candidates', title:'Candidate', taskIds:'Related tasks',
  aiWork:'What AI would do', value:'Expected value', humanCheck:'What a person must check', nonAiAlternative:'Non-AI option', assumption:'Assumption',
  choices:'Priorities', candidateId:'Candidate', decision:'Decision', reason:'Reason', evidenceGap:'Missing evidence', challenge:'Challenge to the choice', costs:'Costs and checking effort',
  owner:'Proposed owner', evidence:'Evidence needed', test:'Next check', stopRule:'When to stop', peopleChange:'Changes for people', recommendation:'Recommendation',
};
function RecordValue({ value, record, field }: { value: unknown; record: WorkshopRecord; field?: string }) {
  if (field === 'candidateId' && typeof value === 'string') return <span>{record.phases[3].answers.candidates?.find(item => item.id === value)?.title ?? value}</span>;
  if (field === 'taskIds' && Array.isArray(value)) return <ul>{value.map((id, index) => <li key={index}>{record.phases[2].answers.tasks?.find(task => task.id === id)?.work ?? String(id)}</li>)}</ul>;
  if (Array.isArray(value)) return <ol className="cw-value-list">{value.map((item, index) => <li key={index}><RecordValue value={item} record={record} /></li>)}</ol>;
  if (value !== null && typeof value === 'object') return <dl className="cw-full-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd><RecordValue value={item} record={record} field={key} /></dd></div>)}</dl>;
  return <span className="cw-wording">{value === null ? 'None' : value === undefined ? 'Not recorded' : String(value)}</span>;
}
function BookIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v15M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" /></svg>;
}

export function InlineWorkshop(props: InlineProps) {
  const {record, phaseId} = props;
  const [bookOpen, setBookOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  const book = useRef<HTMLElement>(null);
  const waiting = props.busy || pending;
  const filesDisabled = waiting || !props.connected;
  const phase = record?.phases[phaseId - 1];
  const current = record?.phases.find(item => item.status !== 'confirmed');
  const approved = record?.phases.filter(item => item.status === 'confirmed').length ?? 0;
  async function run(operation: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError('');
    try { await operation(); }
    catch { setError('Could not complete that request. Your workbook is saved. Try again.'); }
    finally { pendingRef.current = false; setPending(false); }
  }
  function openBook() {
    setBookOpen(true);
    requestAnimationFrame(() => book.current?.focus({preventScroll:true}));
  }
  function closeBook() { setBookOpen(false); requestAnimationFrame(() => opener.current?.focus({preventScroll:true})); }
  if (!record || !phase) return null;
  return <div className="inline-workbook" data-phase={phaseId} aria-busy={waiting}>
    <div className="cw-card" hidden={bookOpen}>
      <header className="cw-header"><h1 id="snapshot-phase-title">Step {phaseId}: {titles[phaseId - 1]}</h1><p className={`cw-step-state cw-state-${progressState(phase,current).key}`}>{snapshotState(phase,current)}</p></header>
      <div className="cw-progress"><ol aria-label={`${approved} of 6 steps approved in this saved view`}>{record.phases.map(item => {
        const state = progressState(item,current);
        return <li key={item.id} className={`cw-progress-${state.key}`} data-step={item.id} data-state={state.key} data-viewed={item.id === phaseId} aria-current={item.id === current?.id ? 'step' : undefined} aria-label={`Step ${item.id}: ${shortTitles[item.id-1]}, ${state.label}${item.id === phaseId ? ', shown below' : ''}`}><span className="cw-progress-number" aria-hidden="true">{item.status === 'confirmed' ? <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m3 8 3 3 7-7" /></svg> : item.id}</span><span aria-hidden="true">{shortTitles[item.id-1]}</span></li>;
      })}</ol></div>
      <main className="cw-main"><section className="cw-phase" aria-labelledby="snapshot-phase-title"><CompactVisual record={record} phaseId={phaseId} /></section></main>
      {(props.noticeError || error) && <p className="cw-notice cw-error" role="alert">{props.exportFailed || /download|PDF|file request/i.test(props.notice ?? '') ? 'The file request did not complete. Your answers are saved.' : 'Could not update this view. Your saved workbook is unchanged.'}</p>}
      <footer className="cw-card-footer"><button ref={opener} type="button" className="cw-view-book" onClick={openBook} aria-expanded={bookOpen} aria-controls="workshop-book-dialog"><BookIcon />View workbook</button>{props.latestRevision !== undefined && props.latestRevision > record.revision && <span className="cw-older">Earlier saved view</span>}</footer>
    </div>
    <section id="workshop-book-dialog" className="cw-book-dialog" ref={book} hidden={!bookOpen} tabIndex={-1} aria-labelledby="book-dialog-title" onKeyDown={event => {if(event.key==='Escape')closeBook();}}>
      <div className="cw-book-toolbar"><div><h2 id="book-dialog-title">Your workbook</h2><p className="cw-group-identity">{record.group.name} · {approved} of 6 steps approved</p></div><button type="button" onClick={closeBook}>Close workbook</button></div>
      {(props.notice || error) && <p className={`cw-notice${props.noticeError || error ? ' cw-error' : ''}`} role={props.noticeError || error ? 'alert' : 'status'}>{error || props.notice}</p>}
      {props.exportFailed && !props.notice && <p className="cw-notice" role="status">Your answers are saved. The PDF needs another try.</p>}
      <div className="cw-book-actions">{props.hasPdf && <button type="button" disabled={filesDisabled} onClick={() => void run(() => props.onDownload('pdf'))}>Download PDF</button>}{props.workspaceUrl && <button type="button" disabled={filesDisabled} onClick={() => void run(props.onOpenWorkspace ?? props.onRequestFiles)}>Latest workbook</button>}</div>
      <div className="cw-chapters">{record.phases.filter(item => Object.keys(item.answers).length > 0).map(item => <details className="cw-saved-chapter" key={item.id} open={item.id === phaseId}><summary>Step {item.id}: {titles[item.id-1]} <span>{statusLabel(item)}</span></summary><RecordValue value={item.answers} record={record} /></details>)}</div>
      {!record.phases.some(item => Object.keys(item.answers).length > 0) && <p className="cw-unrecorded">Your answers will appear here as you continue in chat.</p>}
      {props.bookHtml && <details className="cw-print-preview"><summary>Preview PDF</summary><iframe title="Composed workshop workbook" sandbox="" srcDoc={props.bookHtml} /></details>}
      <details className="cw-access"><summary>Save access and files</summary><div className="cw-file-actions"><button type="button" disabled={filesDisabled} onClick={() => void run(() => props.onDownload('checkpoint'))}>Download saved record</button><button type="button" disabled={filesDisabled} onClick={() => void run(props.onRequestFiles)}>Refresh download</button></div>{props.workspaceUrl && <><p>Keep this reading link for later feedback. Anyone with the link can read and download.</p><p className="cw-access-link">{props.workspaceUrl}</p><p>Keep the editing reference within your group.</p><pre tabIndex={0} aria-label="Private continuation reference">{JSON.stringify(props.continuation,null,2)}</pre></>}</details>
      <details className="cw-backup"><summary>Group details</summary><dl className="cw-full-fields"><div><dt>Problem</dt><dd>{record.group.problem}</dd></div><div><dt>Members</dt><dd>{record.group.members.join(', ')}</dd></div><div><dt>Context</dt><dd>{record.group.context || 'Not recorded'}</dd></div><div><dt>Date</dt><dd>{record.group.date}</dd></div></dl><details><summary>Saved data</summary><pre tabIndex={0} aria-label="Complete JSON record">{JSON.stringify(record,null,2)}</pre></details></details>
      <p className="cw-snapshot-note">Saved version {record.revision}. This view does not include later changes.</p>
    </section>
  </div>;
}
