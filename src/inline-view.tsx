import { useEffect, useRef, useState } from 'react';
import type { Answers, Candidate, InlineProps, Phase, PhaseId, WorkshopRecord } from './inline-types';

const titles = ['Goal and success measure', 'Information and decisions', 'Workflow and remaining delays', 'AI and non-AI options', 'Priorities and reasons', 'Recommendation and next check'];
const shortTitles = ['Goal', 'Context', 'Workflow', 'Options', 'Priorities', 'Next step'];
const statusLabel = (status: Phase['status']) => status === 'confirmed' ? 'Approved' : status === 'needs_review' ? 'Needs review' : 'Draft';
const labels: Record<string, string> = {
  outcome: 'Outcome', kpi: 'Success measure', baseline: 'Baseline', guardrail: 'What must not get worse', hypothesis: 'Expected change',
  blockers: 'Information and decision gaps', information: 'Information or decision needed', holder: 'Who holds it', barrier: 'Barrier', unlock: 'Possible way forward', firstGap: 'First gap to resolve',
  workflows: 'Workflows considered', chosenWorkflow: 'Chosen workflow', recentCase: 'Case replayed', tasks: 'Recorded tasks', id: 'Reference', actor: 'Who does it', work: 'Work', friction: 'Delay or rework',
  zeroSecond: 'What remains if the task takes no time', redesign: 'Proposed workflow change', candidates: 'AI use-case candidates', title: 'Candidate', taskIds: 'Related tasks',
  aiWork: 'What AI would do', value: 'Expected value', humanCheck: 'What a person must check', nonAiAlternative: 'Non-AI option', assumption: 'Assumption',
  choices: 'Priorities', candidateId: 'Candidate', decision: 'Decision', reason: 'Reason', evidenceGap: 'Missing evidence', challenge: 'Challenge to the choice', costs: 'Costs and checking effort',
  owner: 'Proposed accountable owner', evidence: 'Evidence needed', test: 'Bounded test or next check', stopRule: 'When to stop or change course', peopleChange: 'Changes for people', recommendation: 'Recommendation',
};

function Wording({ value }: { value: string | null | undefined }) {
  return value?.trim() ? <p className="cw-wording">{value}</p> : <p className="cw-unrecorded">Not recorded</p>;
}
function Field({ label, value, className = '' }: { label: string; value: string | null | undefined; className?: string }) {
  return <section className={`cw-field ${className}`}><h3>{label}</h3><Wording value={value} /></section>;
}
function RecordValue({ value, record, field }: { value: unknown; record: WorkshopRecord; field?: string }) {
  if (field === 'candidateId' && typeof value === 'string') {
    const candidate = record.phases[3].answers.candidates?.find(item => item.id === value);
    return <span>{candidate ? `${candidate.title} (${value})` : value}</span>;
  }
  if (field === 'taskIds' && Array.isArray(value)) return <ul>{value.map((id, index) => <li key={index}>{record.phases[2].answers.tasks?.find(task => task.id === id)?.work ?? String(id)} <span className="cw-muted">({String(id)})</span></li>)}</ul>;
  if (Array.isArray(value)) return <ol className="cw-value-list">{value.map((item, index) => <li key={index}><RecordValue value={item} record={record} /></li>)}</ol>;
  if (value !== null && typeof value === 'object') return <dl className="cw-full-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd><RecordValue value={item} record={record} field={key} /></dd></div>)}</dl>;
  return <span className="cw-wording">{value === null ? 'None' : value === undefined ? 'Not recorded' : String(value)}</span>;
}
function GoalVisual({ answers: a }: { answers: Answers }) {
  return <figure className="cw-goal" data-visual="goal" aria-label="Relationship between the outcome, measure and safeguards">
    <div className="cw-goal-link"><Field label="Outcome" value={a.outcome} className="cw-goal-outcome" /><div className="cw-relation"><span>Measured by</span><span aria-hidden="true">→</span></div><Field label="Success measure" value={a.kpi} className="cw-goal-measure" /></div>
    <div className="cw-goal-conditions"><Field label="Baseline" value={a.baseline} /><Field label="What must not get worse" value={a.guardrail} /></div>
    <Field label="Expected change" value={a.hypothesis} className="cw-goal-hypothesis" />
  </figure>;
}
function BlockersVisual({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  return <figure className="cw-blockers" data-visual="blockers" aria-label="Information holders, barriers and possible ways forward">
    {a.blockers?.length ? <ol className="cw-barrier-map">{a.blockers.map((blocker, index) => <li key={index}>
      <div className="cw-needed"><span className="cw-order" aria-hidden="true">{index + 1}</span><Field label="Information or decision needed" value={blocker.information} /><Field label="Who holds it" value={blocker.holder} /></div>
      <div className="cw-barrier"><Field label={record.interaction?.barrierCategories?.[String(index)] ? `Barrier: ${record.interaction.barrierCategories[String(index)]}` : 'Barrier'} value={blocker.barrier} /></div>
      <Field label="Possible way forward" value={blocker.unlock} className="cw-unlock" />
    </li>)}</ol> : <p className="cw-unrecorded">No information or decision gaps are recorded in this snapshot.</p>}
    <Field label="First gap to resolve" value={a.firstGap} className="cw-bottom-note" />
  </figure>;
}
function WorkflowVisual({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const selected = a.tasks?.find(task => task.id === record.interaction?.zeroTaskId);
  return <figure className="cw-workflow" data-visual="workflow" aria-label="Recorded task sequence and remaining delays">
    <Field label="Chosen workflow" value={a.chosenWorkflow} className="cw-workflow-name" />
    {a.tasks?.length ? <ol className="cw-task-path">{a.tasks.map((task, index) => <li key={task.id} className={selected?.id === task.id ? 'cw-task-examined' : ''} data-task-id={task.id}>
      <span className="cw-task-number" aria-hidden="true">{index + 1}</span><div className="cw-task-content"><h3>{task.work}</h3><p className="cw-task-actor">{task.actor}</p><div className="cw-task-friction"><span>Delay or rework</span><Wording value={task.friction} /></div>{selected?.id === task.id && <p className="cw-task-note">Selected for the zero-second thought experiment.</p>}</div>
    </li>)}</ol> : <p className="cw-unrecorded">No task sequence is recorded in this snapshot.</p>}
    <div className="cw-counterfactual"><h3>What remains if the task takes no time</h3>{selected && <p className="cw-muted">Task examined: {selected.work}</p>}<Wording value={a.zeroSecond} /></div>
    <Field label="Proposed workflow change" value={a.redesign} className="cw-bottom-note" />
    <details className="cw-supporting"><summary>Read the case and workflows considered</summary><Field label="Case replayed" value={a.recentCase} /><section className="cw-field"><h3>Workflows considered</h3>{a.workflows?.length ? <ul>{a.workflows.map((workflow, index) => <li key={index}>{workflow}</li>)}</ul> : <p className="cw-unrecorded">Not recorded</p>}</section></details>
  </figure>;
}
function CandidateView({ candidate, record }: { candidate: Candidate; record: WorkshopRecord }) {
  const reconsider = record.interaction?.candidateDispositions?.[candidate.id] === 'Reconsider';
  return <article className="cw-candidate" data-candidate-id={candidate.id}>
    <h3>{candidate.title}</h3>{reconsider && <p className="cw-review-note">Marked for reconsideration. The change is not yet resolved in this snapshot.</p>}
    <div className="cw-option-comparison"><section><h4>With AI</h4><Wording value={candidate.aiWork} /></section><section><h4>A non-AI option</h4><Wording value={candidate.nonAiAlternative} /></section></div>
    <section className="cw-human-check"><h4>A person must check</h4><Wording value={candidate.humanCheck} /></section>
    <details className="cw-supporting"><summary>Read value, task links and assumption</summary><dl className="cw-full-fields"><div><dt>Expected value</dt><dd>{candidate.value}</dd></div><div><dt>Related tasks</dt><dd>{candidate.taskIds.length ? <RecordValue field="taskIds" value={candidate.taskIds} record={record} /> : 'No task link recorded'}</dd></div><div><dt>Assumption</dt><dd>{candidate.assumption}</dd></div></dl></details>
  </article>;
}
function CandidatesVisual({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  return <figure className="cw-candidates" data-visual="candidates" aria-label="AI options compared with non-AI alternatives and human checks">
    {a.candidates?.length ? a.candidates.map(candidate => <CandidateView candidate={candidate} record={record} key={candidate.id} />) : <p className="cw-unrecorded">No candidates are recorded in this snapshot.</p>}
  </figure>;
}
function PrioritiesVisual({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = record.phases[3].answers.candidates ?? [];
  const pending = record.interaction?.priorities ?? {};
  const ids = [...new Set([...candidates.map(candidate => candidate.id), ...(a.choices ?? []).map(choice => choice.candidateId), ...Object.keys(pending)])];
  const first = a.choices?.find(choice => choice.decision === 'First');
  return <figure className="cw-priorities" data-visual="priorities" aria-label="Recorded priorities with reasons and missing evidence">
    {ids.length ? <table><caption className="cw-sr-only">Saved priorities and any unresolved proposed changes</caption><thead><tr><th scope="col">Priority</th><th scope="col">Candidate</th><th scope="col">Reason</th><th scope="col">Missing evidence</th></tr></thead><tbody>{ids.map(id => {
      const candidate = candidates.find(item => item.id === id);
      const choice = a.choices?.find(item => item.candidateId === id);
      return <tr key={id} className={choice?.decision === 'First' ? 'cw-first-choice' : ''} data-candidate-id={id}><td data-label="Priority"><span className="cw-priority-name">{choice?.decision ?? 'Not recorded'}</span>{pending[id] && <p className="cw-pending-choice">Proposed: {pending[id]}. The reason has not yet been reconciled.</p>}</td><th scope="row" data-label="Candidate">{candidate?.title ?? `Candidate reference: ${id}`}</th><td data-label={pending[id] ? 'Reason for saved priority' : 'Reason'}><Wording value={choice?.reason} /></td><td data-label="Missing evidence"><Wording value={choice?.evidenceGap} /></td></tr>;
    })}</tbody></table> : <p className="cw-unrecorded">No priorities are recorded in this snapshot.</p>}
    {!first && Boolean(a.choices?.length) && <p className="cw-no-first">No candidate is recorded as First.</p>}
    <div className="cw-priority-context"><Field label="Challenge to the choice" value={a.challenge} /><Field label="Costs and checking effort" value={a.costs} /></div>
  </figure>;
}
function TestVisual({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidate = record.phases[3].answers.candidates?.find(item => item.id === a.candidateId);
  const candidateName = candidate?.title ?? (typeof a.candidateId === 'string' ? `Candidate reference: ${a.candidateId}` : undefined);
  return <figure className="cw-test" data-visual="test" aria-label="Recommendation, proposed owner, bounded test and stop conditions">
    <div className="cw-decision"><Field label="Recorded decision" value={a.decision} />{a.decision === 'Do not pilot yet' ? <p className="cw-muted">No pilot is proposed in this decision.</p> : <Field label="Candidate for the test" value={candidateName} />}</div>
    <Field label="Proposed accountable owner" value={a.owner} className="cw-test-owner" />
    <div className="cw-test-boundary"><Field label={a.decision === 'Do not pilot yet' ? 'Next evidence check' : 'Bounded test'} value={a.test} /><Field label="When to stop or change course" value={a.stopRule} className="cw-stop-condition" /></div>
    <div className="cw-test-context"><Field label="Evidence needed" value={a.evidence} /><Field label="Changes for people" value={a.peopleChange} /></div>
    <Field label="Group recommendation" value={a.recommendation} className="cw-recommendation" />
  </figure>;
}
function PhaseVisual({ record, phaseId }: { record: WorkshopRecord; phaseId: PhaseId }) {
  const answers = record.phases[phaseId - 1].answers;
  if (phaseId === 1) return <GoalVisual answers={answers} />;
  if (phaseId === 2) return <BlockersVisual record={record} answers={answers} />;
  if (phaseId === 3) return <WorkflowVisual record={record} answers={answers} />;
  if (phaseId === 4) return <CandidatesVisual record={record} answers={answers} />;
  if (phaseId === 5) return <PrioritiesVisual record={record} answers={answers} />;
  return <TestVisual record={record} answers={answers} />;
}
function PhaseStatus({ phase }: { phase: Phase }) {
  if (phase.status === 'needs_review') return <p className="cw-review-note">This step needs review because an earlier answer changed.</p>;
  return <p className="cw-phase-status">{phase.status === 'confirmed' ? 'The group approved this step in this snapshot.' : 'Saved draft. Group approval is not recorded for this step.'}</p>;
}

export function InlineWorkshop(props: InlineProps) {
  const { record, phaseId } = props;
  const [bookOpen, setBookOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const pendingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const waiting = props.busy || pending;
  const filesDisabled = waiting || !props.connected;
  const approved = record?.phases.filter(phase => phase.status === 'confirmed').length ?? 0;
  const needsReview = record?.phases.filter(phase => phase.status === 'needs_review').length ?? 0;
  const phase = record?.phases[phaseId - 1];

  useEffect(() => {
    if (bookOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!bookOpen && dialog.current?.open) dialog.current.close();
  }, [bookOpen]);
  async function run(operation: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError('');
    try { await operation(); } catch { setError('The file request did not complete. Your saved snapshot is unchanged. You can request file links in the conversation.'); }
    finally { pendingRef.current = false; setPending(false); }
  }
  function openBook() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBookOpen(true);
  }
  function closeBook() {
    setBookOpen(false);
    setTimeout(() => { if (returnFocus.current?.isConnected) returnFocus.current.focus(); }, 0);
  }
  const downloadButtons = <><button type="button" disabled={filesDisabled || !props.hasPdf} onClick={() => void run(() => props.onDownload('pdf'))}>Download PDF</button><button type="button" disabled={filesDisabled || !record} onClick={() => void run(() => props.onDownload('checkpoint'))}>Download saved record</button></>;

  return <div className="inline-workbook" data-phase={phaseId} aria-busy={waiting}>
    {(props.notice || error) && <p className={`cw-notice${props.noticeError || error ? ' cw-error' : ''}`} role={props.noticeError || error ? 'alert' : 'status'}>{error || props.notice}</p>}
    {!record || !phase ? <section className="cw-empty"><h1>AI use-case workbook</h1><p>{props.connected ? 'No saved workbook record is included in this card. Continue in the conversation.' : 'Waiting for the host to share this workbook snapshot.'}</p></section> : <>
      <header className="cw-header"><h1>{record.group.name} workbook</h1><p>{record.group.problem}</p></header>
      <div className="cw-progress"><p>{approved} of 6 steps approved in this snapshot{needsReview ? `; ${needsReview} ${needsReview === 1 ? 'needs' : 'need'} review` : ''}.</p><ol aria-label="Approval status by step">{record.phases.map(item => <li key={item.id} className={`cw-progress-${item.status}`} aria-current={item.id === phaseId ? 'step' : undefined}><span className="cw-progress-number" aria-hidden="true">{item.status === 'confirmed' ? '✓' : item.id}</span><span>{shortTitles[item.id - 1]}<small>{statusLabel(item.status)}</small></span></li>)}</ol></div>
      <div className={`cw-layout${props.bookHtml ? '' : ' cw-without-book'}`}>
        <main className="cw-main"><section className="cw-phase" aria-labelledby="snapshot-phase-title"><h2 id="snapshot-phase-title">Step {phaseId}: {titles[phaseId - 1]}</h2><PhaseStatus phase={phase} /><PhaseVisual record={record} phaseId={phaseId} /></section>
          <details className="cw-full-wording"><summary>Read this step’s full wording</summary>{Object.keys(phase.answers).length ? <RecordValue value={phase.answers} record={record} /> : <p className="cw-unrecorded">No answers recorded.</p>}</details>
          {record.phases.some(item => item.id !== phaseId && Object.keys(item.answers).length > 0) && <details className="cw-other-steps"><summary>Read other saved steps in this snapshot</summary>{record.phases.filter(item => item.id !== phaseId && Object.keys(item.answers).length > 0).map(item => <details className="cw-saved-chapter" key={item.id}><summary>Step {item.id}: {titles[item.id - 1]} <span>{statusLabel(item.status)}</span></summary><PhaseStatus phase={item} /><PhaseVisual record={record} phaseId={item.id} /></details>)}</details>}
          <div className="cw-file-actions">{downloadButtons}<button type="button" className="cw-text-button" disabled={filesDisabled} onClick={() => void run(props.onRequestFiles)}>Request current file links</button></div>
          {props.exportFailed ? <p className="cw-export-note">The group’s decision was saved, but the PDF could not be created. Ask for a new export in the conversation.</p> : !props.hasPdf && <p className="cw-export-note">No PDF is attached to this snapshot.</p>}
          {!props.connected && <p className="cw-export-note">File controls are unavailable until this view connects to its host. The saved wording remains readable.</p>}
        </main>
        {props.bookHtml && <aside className="cw-book-preview" aria-label="Composed workbook"><button type="button" className="cw-book-open" onClick={openBook} aria-label="Open workbook"><span className="cw-paper-stack" aria-hidden="true"><span className="cw-paper-under" /><span className="cw-paper-cover"><span className="cw-book-title">Our AI use-case workbook</span><span className="cw-book-group">{record.group.name}</span><span className="cw-book-author">Prepared by<br />Dr. Shiva Kakkar</span></span></span><span>Open workbook</span></button><p>The composed book includes approved chapters and those marked for review.</p></aside>}
      </div>
      {props.bookHtml && <div className="cw-mobile-book"><button type="button" onClick={openBook}>Open workbook</button></div>}
      <footer className="cw-snapshot-note">Snapshot of revision {record.revision}. Later conversation changes may not appear in this card.</footer>
      <details className="cw-backup"><summary>Group details and complete saved record</summary><dl className="cw-full-fields"><div><dt>Group members</dt><dd>{record.group.members.join(', ')}</dd></div><div><dt>Context</dt><dd>{record.group.context || 'Not recorded'}</dd></div><div><dt>Date</dt><dd>{record.group.date}</dd></div></dl><pre tabIndex={0} aria-label="Complete JSON record">{JSON.stringify(record, null, 2)}</pre></details>
    </>}
    <dialog id="workshop-book-dialog" className="cw-book-dialog" ref={dialog} onCancel={event => { event.preventDefault(); closeBook(); }} onClose={() => { if (bookOpen) closeBook(); }} aria-labelledby="book-dialog-title">
      <div className="cw-book-toolbar"><h2 id="book-dialog-title">Workbook from this snapshot</h2><div>{downloadButtons}<button type="button" autoFocus onClick={closeBook}>Close workbook</button></div></div>
      {props.bookHtml ? <iframe title="Composed workshop workbook" sandbox="" srcDoc={props.bookHtml} /> : <p className="cw-export-note">No composed book is included in this snapshot.</p>}
    </dialog>
  </div>;
}
