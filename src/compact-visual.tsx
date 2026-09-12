import type { Answers, PhaseId, Priority, WorkshopRecord } from './inline-types';
import { UseCaseFlow } from './use-case-flow';

type Props = { record: WorkshopRecord; phaseId: PhaseId };

// Keep participants' wording intact. The layout grows instead of cutting text.
function Extract({ value, className = '' }: { value?: string | null; className?: string }) {
  return <span className={`cv-extract ${className}`} data-full-text="true">{value?.trim() ? value : 'Not recorded'}</span>;
}

function Arrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Empty({ children }: { children: string }) {
  return <p className="cv-empty">{children}</p>;
}

function Goal({ answers: a }: { answers: Answers }) {
  return <>
    <div className="cv-goal-link">
      <div className="cv-goal-outcome"><span className="cv-label">Outcome</span><p><Extract value={a.outcome} /></p></div>
      <span className="cv-arrow" aria-hidden="true"><Arrow /></span>
      <div className="cv-goal-measure"><span className="cv-label">Measured by</span><p><Extract value={a.kpi} /></p></div>
    </div>
    <dl className="cv-goal-conditions">
      <div><dt>Baseline</dt><dd><Extract value={a.baseline} /></dd></div>
      <div><dt>What must not get worse</dt><dd><Extract value={a.guardrail} /></dd></div>
    </dl>
  </>;
}

function Blockers({ answers: a }: { answers: Answers }) {
  const blockers = a.blockers ?? [];
  return <>
    {blockers.length ? <div className="cv-gap-map">
      <div className="cv-gap-head" aria-hidden="true"><span>Who holds it</span><span>Information or decision gap</span></div>
      <ol>{blockers.map((blocker, index) => <li key={index}>
        <p className="cv-holder"><Extract value={blocker.holder} /></p>
        <div><p className="cv-gap-needed"><Extract value={blocker.information} /></p><p className="cv-gap-barrier"><Extract value={blocker.barrier} /></p></div>
      </li>)}</ol>
    </div> : <Empty>No information or decision gaps are recorded yet.</Empty>}
    {a.firstGap && <p className="cv-bottom"><span className="cv-label">First gap to resolve</span><Extract value={a.firstGap} /></p>}
  </>;
}

function Workflow({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const tasks = a.tasks ?? [];
  const examined = tasks.find(task => task.id === record.interaction?.zeroTaskId);
  return <>
    {a.chosenWorkflow && <p className="cv-workflow-name"><Extract value={a.chosenWorkflow} /></p>}
    {tasks.length ? <ol className="cv-task-path">{tasks.map((task, index) => <li key={task.id} data-task-id={task.id} className={examined?.id === task.id ? 'cv-examined' : ''}>
      <span className="cv-task-number" aria-hidden="true">{index + 1}{index < tasks.length - 1 && <span className="cv-task-arrow"><Arrow /></span>}</span>
      <p className="cv-task-work"><Extract value={task.work} /> <span className="cv-reference">({task.id})</span></p>
      <p className="cv-task-actor"><Extract value={task.actor} /></p>
    </li>)}</ol> : <Empty>No task sequence is recorded yet.</Empty>}
    {a.underlyingProblem && <p className="cv-bottom"><span className="cv-label">{record.phases[2].status==='confirmed'?'Underlying problem agreed by the group':'Underlying problem to review'}</span><Extract value={a.underlyingProblem} /></p>}
    {a.zeroSecond && <p className="cv-bottom"><span className="cv-label">{examined ? `If “${examined.work}” (${examined.id}) took no time` : 'If the task took no time'}</span><Extract value={a.zeroSecond} /></p>}
  </>;
}

function Candidates({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = a.candidates ?? [];
  return <>
    {candidates.length ? <div className="cv-candidate-list">{candidates.map(candidate => <section className="cv-candidate" key={candidate.id} data-candidate-id={candidate.id}>
      <h3><Extract value={candidate.title} /> <span className="cv-reference">({candidate.id})</span></h3>
      {record.interaction?.candidateDispositions?.[candidate.id] === 'Reconsider' && <p className="cv-pending">Needs reconsideration.</p>}
      <div className="cv-option-pair">
        <div><span className="cv-label cv-ai-label">With AI</span><p><Extract value={candidate.aiWork} /></p></div>
        <div><span className="cv-label">Without AI</span><p><Extract value={candidate.nonAiAlternative} /></p></div>
      </div>
      <p className="cv-human-check"><span className="cv-label">Human check</span><Extract value={candidate.humanCheck} /></p>
      <UseCaseFlow steps={candidate.workflow} title={`Proposed workflow: ${candidate.title}`} />
    </section>)}</div> : <Empty>No AI or non-AI options are recorded yet.</Empty>}
  </>;
}

function Priorities({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = record.phases.find(phase => phase.id === 4)?.answers.candidates ?? [];
  const choices = a.choices ?? [];
  const pending = record.interaction?.priorities ?? {};
  const ids = [...new Set([...candidates.map(candidate => candidate.id), ...choices.map(choice => choice.candidateId), ...Object.keys(pending)])];
  const title = (id: string) => {const candidate=candidates.find(item=>item.id===id);return candidate ? `${candidate.title} (${id})` : `Use-case name not available (${id})`;};
  const decision = (id: string) => {
    const matches = choices.filter(choice => choice.candidateId === id);
    return matches.length === 1 ? matches[0].decision : null;
  };
  const lanes: { label: Priority | 'Needs a decision'; tone: string; ids: string[] }[] = [
    { label: 'First', tone: 'first', ids: ids.filter(id => decision(id) === 'First') },
    { label: 'Later', tone: 'later', ids: ids.filter(id => decision(id) === 'Later') },
    { label: 'Do not pursue', tone: 'stop', ids: ids.filter(id => decision(id) === 'Do not pursue') },
  ];
  const unassigned = ids.filter(id => !decision(id));
  if (unassigned.length) lanes.push({ label: 'Needs a decision', tone: 'unassigned', ids: unassigned });
  const pendingEntries = Object.entries(pending);
  return <>
    {ids.length ? <div className="cv-priority-lanes">{lanes.map(lane => <section className={`cv-priority-lane cv-lane-${lane.tone}`} key={lane.label} data-priority={lane.label}>
      <h3>{lane.label}<span className="cv-count" aria-label={`${lane.ids.length} candidates`}>{lane.ids.length}</span></h3>
      {lane.ids.length ? <ul>{lane.ids.map(id => <li key={id} data-candidate-id={id}><Extract value={title(id)} /></li>)}</ul> : <p className="cv-lane-empty">None recorded</p>}
    </section>)}</div> : <Empty>No priorities are recorded yet.</Empty>}
    {pendingEntries.length > 0 && <div className="cv-pending-priorities"><p className="cv-label">Proposed changes still need reasons</p><ul>{pendingEntries.map(([id, proposed]) => <li key={id}><Extract value={title(id)} /><span aria-hidden="true"> → </span><span className="cv-proposed-decision">{proposed}</span></li>)}</ul></div>}
  </>;
}

function NextCheck({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = record.phases.find(phase => phase.id === 4)?.answers.candidates ?? [];
  const choices = record.phases.find(phase => phase.id === 5)?.answers.choices ?? [];
  const noPilot = a.decision === 'Do not pilot yet';
  return <>
    {candidates.length ? <div className="cv-final-cases">{candidates.map(candidate=><section className="cv-candidate" key={candidate.id} data-candidate-id={candidate.id}><h3>{candidate.title} <span className="cv-reference">({candidate.id})</span></h3><p><Extract value={candidate.aiWork} /></p>{choices.find(choice=>choice.candidateId===candidate.id) && <p className="cv-case-priority">Recorded priority: {choices.find(choice=>choice.candidateId===candidate.id)?.decision}</p>}<UseCaseFlow steps={candidate.workflow} title={`Proposed workflow: ${candidate.title}`} /></section>)}</div> : <Empty>No use cases are recorded yet.</Empty>}
    {a.recommendation && <p className="cv-bottom"><span className="cv-label">Group recommendation</span><Extract value={a.recommendation} /></p>}
    {a.decision && <p className={`cv-implementation-decision${noPilot ? ' cv-no-pilot' : ''}`}><span className="cv-label">Implementation recommendation</span>{noPilot ? 'Do not begin an implementation test yet.' : 'A bounded implementation test is proposed.'}</p>}
    {(a.owner || a.test) && <dl className="cv-next-check">
      {a.owner && <div><dt>Proposed owner</dt><dd><Extract value={a.owner} /></dd></div>}
      {a.test && <div><dt>{noPilot ? 'Next evidence check' : 'Next check'}</dt><dd><Extract value={a.test} /></dd></div>}
    </dl>}
  </>;
}

export function CompactVisual({ record, phaseId }: Props) {
  const phase = record.phases.find(item => item.id === phaseId);
  const answers = phase?.answers ?? {};
  const kind = ['goal', 'blockers', 'workflow', 'candidates', 'priorities', 'test'][phaseId - 1];
  const descriptions = ['Outcome and its success measure', 'Information holders and recorded gaps', 'Recorded task order and remaining delay', 'AI options, non-AI alternatives and human checks', 'Saved priorities and unresolved proposals', 'Identified use cases and group recommendation'];
  return <figure className={`compact-visual cv-${kind}`} data-visual={kind} data-compact="true" aria-label={descriptions[phaseId - 1]}>
    {phaseId === 1 && <Goal answers={answers} />}
    {phaseId === 2 && <Blockers answers={answers} />}
    {phaseId === 3 && <Workflow record={record} answers={answers} />}
    {phaseId === 4 && <Candidates record={record} answers={answers} />}
    {phaseId === 5 && <Priorities record={record} answers={answers} />}
    {phaseId === 6 && <NextCheck record={record} answers={answers} />}
  </figure>;
}
