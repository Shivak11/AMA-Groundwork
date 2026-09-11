import type { Answers, PhaseId, Priority, WorkshopRecord } from './inline-types';

type Props = { record: WorkshopRecord; phaseId: PhaseId };

// These are visibly shortened quotations of saved wording, never summaries.
function Extract({ value, limit = 72, className = '' }: { value?: string | null; limit?: number; className?: string }) {
  const text = value?.replace(/\s+/gu, ' ').trim() || 'Not recorded';
  const points = Array.from(text);
  const abbreviated = points.length > limit;
  const prefix = points.slice(0, limit - 1).join('');
  const boundary = prefix.lastIndexOf(' ');
  const wholeWords = points[limit - 1] === ' ' || boundary < 1 ? prefix : prefix.slice(0, boundary);
  const visible = abbreviated ? `${wholeWords.trimEnd()}…` : text;
  return <span className={`cv-extract ${className}`} data-excerpt="true" data-abbreviated={abbreviated}>{visible}</span>;
}

function Arrow() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3 10h13M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function More({ total, shown, noun }: { total: number; shown: number; noun: string }) {
  if (total <= shown) return null;
  return <p className="cv-more" data-remaining={total - shown}>{total - shown} more {noun}{total - shown === 1 ? '' : 's'} in the workbook.</p>;
}

function Empty({ children }: { children: string }) {
  return <p className="cv-empty">{children}</p>;
}

function Goal({ answers: a }: { answers: Answers }) {
  return <>
    <div className="cv-goal-link">
      <div className="cv-goal-outcome"><span className="cv-label">Outcome</span><p><Extract value={a.outcome} limit={105} /></p></div>
      <span className="cv-arrow" aria-hidden="true"><Arrow /></span>
      <div className="cv-goal-measure"><span className="cv-label">Measured by</span><p><Extract value={a.kpi} limit={90} /></p></div>
    </div>
    <dl className="cv-goal-conditions">
      <div><dt>Baseline</dt><dd><Extract value={a.baseline} limit={36} /></dd></div>
      <div><dt>What must not get worse</dt><dd><Extract value={a.guardrail} limit={76} /></dd></div>
    </dl>
  </>;
}

function Blockers({ answers: a }: { answers: Answers }) {
  const blockers = a.blockers ?? [];
  return <>
    {blockers.length ? <div className="cv-gap-map">
      <div className="cv-gap-head" aria-hidden="true"><span>Who holds it</span><span>Information or decision gap</span></div>
      <ol>{blockers.slice(0, 2).map((blocker, index) => <li key={index}>
        <p className="cv-holder"><Extract value={blocker.holder} limit={36} /></p>
        <div><p className="cv-gap-needed"><Extract value={blocker.information} limit={56} /></p><p className="cv-gap-barrier"><Extract value={blocker.barrier} limit={70} /></p></div>
      </li>)}</ol>
    </div> : <Empty>No information or decision gaps are recorded yet.</Empty>}
    <More total={blockers.length} shown={2} noun="gap" />
    {a.firstGap && <p className="cv-bottom"><span className="cv-label">First gap to resolve</span><Extract value={a.firstGap} limit={84} /></p>}
  </>;
}

function Workflow({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const tasks = a.tasks ?? [];
  const examined = tasks.findIndex(task => task.id === record.interaction?.zeroTaskId);
  return <>
    {a.chosenWorkflow && <p className="cv-workflow-name"><Extract value={a.chosenWorkflow} limit={72} /></p>}
    {tasks.length ? <ol className="cv-task-path">{tasks.slice(0, 5).map((task, index) => <li key={task.id} data-task-id={task.id} className={examined === index ? 'cv-examined' : ''}>
      <span className="cv-task-number" aria-hidden="true">{index + 1}{index < Math.min(tasks.length, 5) - 1 && <span className="cv-task-arrow"><Arrow /></span>}</span>
      <p className="cv-task-work"><Extract value={task.work} limit={58} /></p>
      <p className="cv-task-actor"><Extract value={task.actor} limit={24} /></p>
    </li>)}</ol> : <Empty>No task sequence is recorded yet.</Empty>}
    <More total={tasks.length} shown={5} noun="task" />
    {a.zeroSecond && <p className="cv-bottom"><span className="cv-label">{examined >= 0 ? `If task ${examined + 1} took no time` : 'If the task took no time'}</span><Extract value={a.zeroSecond} limit={94} /></p>}
  </>;
}

function Candidates({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = a.candidates ?? [];
  return <>
    {candidates.length ? <div className="cv-candidate-list">{candidates.slice(0, 2).map(candidate => <section className="cv-candidate" key={candidate.id} data-candidate-id={candidate.id}>
      <h3><Extract value={candidate.title} limit={48} /></h3>
      {record.interaction?.candidateDispositions?.[candidate.id] === 'Reconsider' && <p className="cv-pending">Needs reconsideration.</p>}
      <div className="cv-option-pair">
        <div><span className="cv-label cv-ai-label">With AI</span><p><Extract value={candidate.aiWork} limit={62} /></p></div>
        <div><span className="cv-label">Without AI</span><p><Extract value={candidate.nonAiAlternative} limit={56} /></p></div>
      </div>
      <p className="cv-human-check"><span className="cv-label">Human check</span><Extract value={candidate.humanCheck} limit={78} /></p>
    </section>)}</div> : <Empty>No AI or non-AI options are recorded yet.</Empty>}
    <More total={candidates.length} shown={2} noun="candidate" />
  </>;
}

function Priorities({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidates = record.phases.find(phase => phase.id === 4)?.answers.candidates ?? [];
  const choices = a.choices ?? [];
  const pending = record.interaction?.priorities ?? {};
  const ids = [...new Set([...candidates.map(candidate => candidate.id), ...choices.map(choice => choice.candidateId), ...Object.keys(pending)])];
  const title = (id: string) => candidates.find(candidate => candidate.id === id)?.title || `Candidate ${id}`;
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
      {lane.ids.length ? <ul>{lane.ids.slice(0, 2).map(id => <li key={id} data-candidate-id={id}><Extract value={title(id)} limit={44} /></li>)}</ul> : <p className="cv-lane-empty">None recorded</p>}
      <More total={lane.ids.length} shown={2} noun="candidate" />
    </section>)}</div> : <Empty>No priorities are recorded yet.</Empty>}
    {pendingEntries.length > 0 && <div className="cv-pending-priorities"><p className="cv-label">Proposed changes still need reasons</p><ul>{pendingEntries.slice(0, 2).map(([id, proposed]) => <li key={id}><Extract value={title(id)} limit={32} /><span aria-hidden="true"> → </span><span className="cv-proposed-decision">{proposed}</span></li>)}</ul><More total={pendingEntries.length} shown={2} noun="proposed change" /></div>}
  </>;
}

function NextCheck({ record, answers: a }: { record: WorkshopRecord; answers: Answers }) {
  const candidate = record.phases.find(phase => phase.id === 4)?.answers.candidates?.find(item => item.id === a.candidateId);
  const noPilot = a.decision === 'Do not pilot yet';
  return <>
    <div className={`cv-decision ${noPilot ? 'cv-no-pilot' : ''}`}><p className="cv-decision-label">{a.decision || 'Decision not recorded'}</p>
      {a.decision === 'Test a use case' && <p className="cv-selected-candidate"><Extract value={candidate?.title ?? (a.candidateId ? `Candidate ${a.candidateId}` : null)} limit={64} /></p>}
    </div>
    <dl className="cv-next-check">
      <div><dt>Proposed owner</dt><dd><Extract value={a.owner} limit={80} /></dd></div>
      <div><dt>{noPilot ? 'Next evidence check' : 'Next check'}</dt><dd><Extract value={a.test} limit={112} /></dd></div>
    </dl>
  </>;
}

export function CompactVisual({ record, phaseId }: Props) {
  const phase = record.phases.find(item => item.id === phaseId);
  const answers = phase?.answers ?? {};
  const kind = ['goal', 'blockers', 'workflow', 'candidates', 'priorities', 'test'][phaseId - 1];
  const descriptions = ['Outcome and its success measure', 'Information holders and recorded gaps', 'Recorded task order and remaining delay', 'AI options, non-AI alternatives and human checks', 'Saved priorities and unresolved proposals', 'Recorded decision, proposed owner and next check'];
  return <figure className={`compact-visual cv-${kind}`} data-visual={kind} data-compact="true" aria-label={descriptions[phaseId - 1]}>
    {phaseId === 1 && <Goal answers={answers} />}
    {phaseId === 2 && <Blockers answers={answers} />}
    {phaseId === 3 && <Workflow record={record} answers={answers} />}
    {phaseId === 4 && <Candidates record={record} answers={answers} />}
    {phaseId === 5 && <Priorities record={record} answers={answers} />}
    {phaseId === 6 && <NextCheck record={record} answers={answers} />}
  </figure>;
}
