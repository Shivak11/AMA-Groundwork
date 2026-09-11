import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Action, Answers, Candidate, InlineProps, PhaseId, Priority, WorkshopRecord } from './inline-types';

const ids: PhaseId[] = [1, 2, 3, 4, 5, 6];
const titles = ['What should improve?', 'What prevents progress?', 'What actually happens?', 'Where could AI help?', 'Which should we pursue first?', 'What do we recommend?'];
const categories = ['Missing information', 'Access', 'Authority', 'Incentives', 'Trust', 'Other'];
const priorities: Priority[] = ['First', 'Later', 'Do not pursue'];
const fields: Record<PhaseId, (keyof Answers)[]> = {
  1: ['outcome', 'kpi', 'baseline', 'guardrail', 'hypothesis'],
  2: ['blockers', 'firstGap'],
  3: ['workflows', 'chosenWorkflow', 'recentCase', 'tasks', 'zeroSecond', 'redesign'],
  4: ['candidates'],
  5: ['choices', 'challenge', 'costs'],
  6: ['decision', 'candidateId', 'owner', 'evidence', 'test', 'stopRule', 'peopleChange', 'recommendation'],
};
const labels: Record<string, string> = {
  outcome: 'What should improve', kpi: 'How we will measure it', baseline: 'What we know today',
  guardrail: 'What must not get worse', hypothesis: 'The change we expect to help',
  blockers: 'Information and decisions we need', information: 'Information or decision', holder: 'Who holds it',
  barrier: 'What prevents access or action', unlock: 'What could resolve it', firstGap: 'The first gap to resolve',
  workflows: 'Workflows considered', chosenWorkflow: 'The workflow we chose', recentCase: 'The case we replayed',
  tasks: 'What happened', id: 'Reference', actor: 'Who does it', work: 'The work', friction: 'Delay or rework',
  zeroSecond: 'If the selected task took no time', redesign: 'What should change in the workflow',
  candidates: 'Possible uses of AI', title: 'Use case', taskIds: 'Related task references', aiWork: 'What AI would do',
  value: 'What could improve', humanCheck: 'What a person must check', nonAiAlternative: 'A non-AI option', assumption: 'What still needs to be true',
  choices: 'Our priorities', candidateId: 'Candidate reference', decision: 'Our decision', reason: 'Why', evidenceGap: 'Missing evidence',
  challenge: 'The strongest challenge to our choice', costs: 'Costs and checking effort', owner: 'Proposed accountable owner',
  evidence: 'Evidence needed', test: 'The bounded test or next check', stopRule: 'When to stop or change course',
  peopleChange: 'What changes for people', recommendation: 'Our recommendation',
};
const questions: Partial<Record<keyof Answers, [string, string]>> = {
  outcome: ['What would your group like to improve?', 'Describe the problem and who experiences it. Start with the work, rather than an AI tool.'],
  kpi: ['How would you know it has improved?', 'Name a measure with a clear start and end. Avoid claiming a saving before you have evidence.'],
  baseline: ['What do you know about that measure today?', 'Use a known figure and its source, or record that the baseline is unknown.'],
  guardrail: ['What must not get worse?', 'Name the quality, safety, fairness or service condition you need to protect.'],
  hypothesis: ['What change do you think could help?', 'Explain how it might improve your chosen measure. This is an expectation to test.'],
  firstGap: ['Which information or decision gap should you resolve first?', 'Say what is needed, who can help and what you would ask them to do.'],
  chosenWorkflow: ['Which workflow will you examine?', 'Choose one of the workflows your group has recorded.'],
  recentCase: ['What happened in a recent difficult case?', 'Describe what actually happened. Do not include names, personal records or confidential details.'],
  zeroSecond: ['If this task took no time, what would still prevent your outcome?', 'Consider waiting, approvals and rework elsewhere. An instant task does not remove a delay caused by authority or access.'],
  redesign: ['What should change in the workflow itself?', 'Explain what you would keep, remove or rearrange after the thought experiment.'],
  challenge: ['What is the strongest reason against your chosen priority?', 'Invite someone else in the group to challenge the choice. Choosing no candidate first is valid.'],
  costs: ['What would it take to run and check this regularly?', 'Consider information access, people’s checking time, recurring tool costs and who will maintain it.'],
  owner: ['Who could be accountable for the next step?', 'Name a proposed role or person. Their agreement and capacity still need to be checked.'],
  evidence: ['What evidence do you need before proceeding?', 'Separate what you know from what you need to check. Use authorised information only.'],
  test: ['What small test or evidence check would you run?', 'Specify the scope, the comparison and what a person checks before any output is used. Do not upload confidential or personal records here.'],
  stopRule: ['What result would make you stop or change course?', 'Choose an observable condition. Include the risks that would make continuing unacceptable.'],
  peopleChange: ['What would change for the people doing this work?', 'Describe responsibilities, checking, training and any approval needed.'],
  recommendation: ['What will your group recommend?', 'Connect your proposed next step to the outcome, evidence and limits you have recorded.'],
};
const scalarFields = new Set(Object.keys(questions));
type Draft = { value: string; base: string | null | undefined; submitted: boolean; custom: boolean };
type Move = { kind: 'scalar'; field: keyof Answers } | { kind: 'chat'; question: string; hint: string; prompt: string } |
  { kind: 'barrier'; index: number } | { kind: 'tasks' } | { kind: 'candidate'; index: number } |
  { kind: 'priority'; index: number } | { kind: 'decision' } | { kind: 'pilot' } | { kind: 'review' };
const has = (value: unknown): boolean => typeof value === 'string' ? Boolean(value.trim()) : Array.isArray(value) ? value.length > 0 : value === null;
const asText = (value: unknown): string => typeof value === 'string' ? value : '';
const ask = (question: string, hint: string, prompt: string): Move => ({ kind: 'chat', question, hint, prompt });

function nextMove(record: WorkshopRecord, phaseId: PhaseId, cursor: number | null): Move {
  const phase = record.phases[phaseId - 1];
  const a = phase.answers;
  const interaction = record.interaction;
  if (phase.status === 'confirmed' && cursor === null) return { kind: 'review' };
  if (phaseId === 1) {
    const field = fields[1].find(key => !has(a[key]));
    return field ? { kind: 'scalar', field } : { kind: 'review' };
  }
  if (phaseId === 2) {
    if (!a.blockers?.length) return ask('What information or decision is holding up the work?', 'Discuss one factual case in the conversation. We will record who holds the information, what prevents action and a possible way forward.', 'Help our group record the information and decision gaps for Step 2, using our stated outcome. Ask us about one factual case first. Do not invent the blocker, its holder or a solution.');
    const missing = a.blockers.findIndex((_, index) => !interaction?.barrierCategories?.[String(index)]);
    const index = cursor ?? missing;
    if (index >= 0 && index < a.blockers.length) return { kind: 'barrier', index };
    return has(a.firstGap) ? { kind: 'review' } : { kind: 'scalar', field: 'firstGap' };
  }
  if (phaseId === 3) {
    if (!a.workflows?.length) return ask('Which workflows could affect your outcome?', 'Name up to three actual workflows. You will choose one to examine.', 'Help us name up to three workflows that affect our recorded outcome for Step 3. Ask for our examples rather than inventing a case.');
    if (!has(a.chosenWorkflow)) return { kind: 'scalar', field: 'chosenWorkflow' };
    if (!has(a.recentCase)) return { kind: 'scalar', field: 'recentCase' };
    if (!a.tasks || a.tasks.length < 2) return ask('Who did what in that case?', 'Reconstruct two to six steps, including the waiting and rework.', 'Help us replay the actual case recorded in Step 3. Ask who did what next and where it waited or returned for rework. Record two to six tasks with stable IDs; do not invent missing steps.');
    if (!interaction?.zeroTaskId) return { kind: 'tasks' };
    if (!has(a.zeroSecond)) return { kind: 'scalar', field: 'zeroSecond' };
    return has(a.redesign) ? { kind: 'review' } : { kind: 'scalar', field: 'redesign' };
  }
  const candidates = record.phases[3].answers.candidates ?? [];
  if (phaseId === 4) {
    if (!candidates.length) return ask('Which recorded task could AI help with?', 'We will compare the idea with a non-AI option and identify what a person must check.', 'Help us identify a possible use of AI grounded in our Step 3 tasks. Ask for our idea first. For each candidate, record its task links, AI work, possible value, human check, non-AI alternative and assumption.');
    const missing = candidates.findIndex(candidate => interaction?.candidateDispositions?.[candidate.id] !== 'Keep');
    const index = cursor ?? missing;
    return index >= 0 && index < candidates.length ? { kind: 'candidate', index } : { kind: 'review' };
  }
  if (phaseId === 5) {
    if (!candidates.length) return ask('The candidates need to be recorded first.', 'Return to Step 4 in the conversation before prioritising.', 'Help us complete and review Step 4 before prioritising. There are no recorded candidates to compare.');
    const missing = candidates.findIndex(candidate => interaction?.priorities?.[candidate.id] || !a.choices?.some(choice => choice.candidateId === candidate.id));
    const index = cursor ?? missing;
    if (index >= 0 && index < candidates.length) return { kind: 'priority', index };
    if (!has(a.challenge)) return { kind: 'scalar', field: 'challenge' };
    return has(a.costs) ? { kind: 'review' } : { kind: 'scalar', field: 'costs' };
  }
  if (!a.decision) return { kind: 'decision' };
  if (a.decision === 'Test a use case' && !a.candidateId) return { kind: 'pilot' };
  const field = fields[6].filter(key => key !== 'decision' && key !== 'candidateId').find(key => !has(a[key]));
  return field ? { kind: 'scalar', field } : { kind: 'review' };
}

function ChoiceButton({ title, detail, selected, disabled, onClick }: { title: string; detail?: string; selected?: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="iw-choice" aria-pressed={Boolean(selected)} disabled={disabled} onClick={onClick}>
    <span><strong>{title}</strong>{detail && <span className="iw-choice-detail">{detail}</span>}</span>
    <span className={`iw-choice-mark${selected ? ' checked' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>
  </button>;
}
function ReadValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <ol className="iw-read-list">{value.map((item, index) => <li key={index}><ReadValue value={item} /></li>)}</ol>;
  if (value !== null && typeof value === 'object') return <dl className="iw-read-fields">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd><ReadValue value={item} /></dd></div>)}</dl>;
  return <span className="iw-wording">{value === null ? 'None' : String(value)}</span>;
}
function CandidateComparison({ candidate }: { candidate: Candidate }) {
  return <><div className="iw-comparison"><div><h3>With AI</h3><p>{candidate.aiWork}</p></div><div><h3>A non-AI option</h3><p>{candidate.nonAiAlternative}</p></div></div>
    <div className="iw-human-check"><h3>A person must check</h3><p>{candidate.humanCheck}</p></div>
    <details className="iw-candidate-detail"><summary>Value and assumptions</summary><p>{candidate.value}</p><p>{candidate.assumption}</p></details></>;
}
function LatestChapter({ record }: { record: WorkshopRecord }) {
  const latest = record.phases.filter(phase => phase.status === 'confirmed').at(-1);
  if (!latest) return null;
  const a = latest.answers;
  let content: ReactNode;
  if (latest.id === 1) content = <div className="iw-mini-goal"><p>{a.outcome}</p><span>Measured by</span><p>{a.kpi}</p></div>;
  else if (latest.id === 2) content = <p className="iw-mini-wording">{a.firstGap}</p>;
  else if (latest.id === 3) content = <ol className="iw-mini-path">{a.tasks?.map(task => <li key={task.id}>{task.work}</li>)}</ol>;
  else if (latest.id === 4) content = <ul className="iw-mini-candidates">{a.candidates?.map(candidate => <li key={candidate.id}>{candidate.title}</li>)}</ul>;
  else if (latest.id === 5) {
    const first = a.choices?.find(choice => choice.decision === 'First');
    const candidate = record.phases[3].answers.candidates?.find(item => item.id === first?.candidateId);
    content = candidate ? <div className="iw-mini-priority"><span>First</span><p>{candidate.title}</p></div> : <p>No candidate chosen first.</p>;
  } else content = <div className="iw-mini-goal"><p>{a.decision}</p><span>Proposed owner</span><p>{a.owner}</p></div>;
  return <section className="iw-latest-chapter" aria-label={`Latest approved chapter, Step ${latest.id}`}><p>Step {latest.id} added to your book</p><div>{content}</div></section>;
}

export function InlineWorkshop(props: InlineProps) {
  const { record, busy } = props;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<{ phaseId: PhaseId; field: keyof Answers } | null>(null);
  const [cursor, setCursor] = useState<{ phaseId: PhaseId; index: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState<Record<number, boolean>>({});
  const [bookOpen, setBookOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localPending, setLocalPending] = useState(false);
  const pendingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A host reply may save this field or advance to another phase while the
  // group is typing. Keep its local draft reachable until explicitly resolved.
  const unfinishedDraft = Object.entries(drafts).find(([, draft]) => draft.value !== (draft.base ?? ''));
  const pinnedDraft = unfinishedDraft ? {
    phaseId: Number(unfinishedDraft[0].split(':')[0]) as PhaseId,
    field: unfinishedDraft[0].split(':')[1] as keyof Answers,
  } : null;
  const phaseId = pinnedDraft?.phaseId ?? props.phaseId;
  const dirty = Boolean(unfinishedDraft);
  const waiting = busy || localPending;
  const mutable = props.canMutate && phaseId <= props.activePhase && !waiting && !props.contextBlocked && !props.conflict;
  const canAct = mutable && !dirty;
  const canAsk = props.canChat && !waiting && !props.contextBlocked && !props.conflict && !dirty;
  const a = record?.phases[phaseId - 1]?.answers ?? {};
  const phase = record?.phases[phaseId - 1];
  const interaction = record?.interaction;
  const candidates = record?.phases[3].answers.candidates ?? [];
  const approvedCount = record?.phases.filter(item => item.status === 'confirmed').length ?? 0;
  const reviewCount = record?.phases.filter(item => item.status === 'needs_review').length ?? 0;
  const selectedCursor = cursor?.phaseId === phaseId ? cursor.index : null;
  let move: Move = record ? nextMove(record, phaseId, selectedCursor) : { kind: 'review' };
  if (editing?.phaseId === phaseId) move = scalarFields.has(editing.field) ? { kind: 'scalar', field: editing.field } : editing.field === 'decision' ? { kind: 'decision' } : editing.field === 'candidateId' ? { kind: 'pilot' } : move;
  const proposal = props.presentation;
  const visualPending = ['barrier', 'tasks', 'candidate', 'priority'].includes(move.kind) || Object.values(interaction?.candidateDispositions ?? {}).includes('Reconsider') || Object.keys(interaction?.priorities ?? {}).length > 0;
  if (!editing && proposal?.phaseId === phaseId && scalarFields.has(proposal.field) && fields[phaseId].includes(proposal.field) && !visualPending) move = { kind: 'scalar', field: proposal.field };
  const draftHeldOpen = pinnedDraft && (phaseId !== props.phaseId || move.kind !== 'scalar' || move.field !== pinnedDraft.field);
  if (pinnedDraft) move = { kind: 'scalar', field: pinnedDraft.field };
  const presentation = props.presentation?.phaseId === phaseId && move.kind === 'scalar' && props.presentation.field === move.field ? props.presentation : undefined;
  const activeKey = `${phaseId}:${move.kind}:${move.kind === 'scalar' ? move.field : 'index' in move ? move.index : ''}`;

  useEffect(() => { props.onDirty(dirty); }, [dirty, props.onDirty]);
  useEffect(() => {
    if (!record) return;
    const accepted = Object.entries(drafts).filter(([key, draft]) => {
      const [p, field] = key.split(':');
      return draft.submitted && record.phases[Number(p) - 1]?.answers[field as keyof Answers] === draft.value.trim();
    }).map(([key]) => key);
    if (!accepted.length) return;
    setDrafts(previous => { const next = { ...previous }; accepted.forEach(key => { delete next[key]; }); return next; });
    setEditing(current => current && accepted.includes(`${current.phaseId}:${current.field}`) ? null : current);
  }, [record, drafts]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [activeKey]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (bookOpen && dialog && !dialog.open) dialog.showModal();
    if (!bookOpen && dialog?.open) dialog.close();
  }, [bookOpen]);

  async function run(operation: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true; setLocalPending(true); setLocalError('');
    try { await operation(); } catch (error) { setLocalError(error instanceof Error ? error.message : 'The action did not complete. Your saved wording has not been replaced here.'); }
    finally { pendingRef.current = false; setLocalPending(false); }
  }
  function action(patch: Omit<Action, 'phaseId' | 'expectedRevision'>, actionPhase: PhaseId = phaseId) {
    if (!record || !mutable) return;
    void run(() => props.onAction({ ...patch, phaseId: actionPhase, expectedRevision: record.revision }));
  }
  function request(prompt: string) { if (canAsk) void run(() => props.onAsk(prompt)); }
  function openBook() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBookOpen(true);
  }
  function closeBook() {
    setBookOpen(false);
    setTimeout(() => returnFocus.current?.focus(), 0);
  }
  function edit(field: keyof Answers) {
    if (!canAct) return;
    setEditing({ phaseId, field }); setCursor(null);
    if (scalarFields.has(field)) setDrafts(previous => ({ ...previous, [`${phaseId}:${field}`]: { value: asText(a[field]), base: asText(a[field]), submitted: false, custom: true } }));
  }
  function cancelDraft() {
    if (move.kind === 'scalar') setDrafts(previous => { const next = { ...previous }; delete next[`${phaseId}:${move.field}`]; return next; });
    setEditing(null);
  }
  function browse(index: number | null) { if (!dirty && !waiting) setCursor(index === null ? null : { phaseId, index }); }
  function nav(count: number, index: number) {
    return <div className="iw-item-nav"><button type="button" disabled={waiting || dirty || index === 0} onClick={() => browse(index - 1)}>Previous</button><span>{index + 1} of {count}</span><button type="button" disabled={waiting || dirty} onClick={() => browse(index === count - 1 ? null : index + 1)}>{index === count - 1 ? 'Finish review' : 'Next'}</button></div>;
  }

  let question = titles[phaseId - 1];
  let hint = '';
  let body: ReactNode = null;
  if (move.kind === 'scalar') {
    const { field } = move;
    const key = `${phaseId}:${field}`;
    const draft = drafts[key];
    const value = draft?.value ?? asText(a[field]);
    const currentValue = asText(a[field]);
    const stale = Boolean(draft && currentValue !== (draft.base ?? '') && currentValue !== draft.value.trim());
    [question, hint] = questions[field] ?? [labels[field], 'Use your group’s wording.'];
    if (field === 'zeroSecond') {
      const task = a.tasks?.find(item => item.id === interaction?.zeroTaskId);
      if (task) question = `If “${task.work}” took no time, what would still prevent your outcome?`;
    }
    if (field === 'test' && a.decision === 'Do not pilot yet') { question = 'What evidence check should happen before a pilot is considered?'; hint = 'Describe a bounded check. This records a next step without authorising an AI pilot.'; }
    if (presentation) { question = presentation.question; hint = presentation.hint ?? hint; }
    const choices = [...(presentation?.choices.filter(choice => typeof choice.value === 'string') ?? (field === 'chosenWorkflow' ? (a.workflows ?? []).map(workflow => ({ label: workflow, value: workflow })) : []))];
    if (field === 'baseline' && !choices.some(choice => choice.value?.trim().toLowerCase() === 'unknown')) choices.push({ label: 'We do not know yet', value: 'Unknown' });
    const showCustom = !choices.length || Boolean(draft?.custom) || Boolean(value && !choices.some(choice => choice.value === value));
    function update(value: string, custom = showCustom) {
      setDrafts(previous => ({ ...previous, [key]: { base: previous[key]?.base ?? currentValue, value, submitted: false, custom } }));
    }
    function save() {
      if (!mutable || stale || !value.trim()) return;
      setDrafts(previous => ({ ...previous, [key]: { base: previous[key]?.base ?? currentValue, value, submitted: true, custom: showCustom } }));
      action({ kind: 'set_answer', field, value: value.trim() });
    }
    body = <div className="iw-scalar" data-field={field}>
      {presentation && <p className="iw-small">Suggested wording for your group to review.</p>}
      {choices.length > 0 && <div className="iw-choices">{choices.map((choice, index) => <ChoiceButton key={index} title={choice.label} selected={value === choice.value} disabled={!mutable} onClick={() => update(choice.value as string, false)} />)}</div>}
      {!showCustom && value && <div className="iw-proposed-answer"><span className="iw-small">Wording to save</span><p>{value}</p></div>}
      {choices.length > 0 && <button type="button" className="iw-text-button" aria-expanded={showCustom} disabled={!mutable} onClick={() => update(value, !showCustom)}>{showCustom ? 'Use the suggested choices' : 'Use our own wording'}</button>}
      {showCustom && <div className="iw-editor"><label htmlFor={`answer-${field}`}>Your group’s answer</label><textarea id={`answer-${field}`} value={value} maxLength={1200} disabled={!mutable} onChange={event => update(event.currentTarget.value, true)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); save(); } }} /><span className="iw-small">{value.length}/1200 characters</span></div>}
      {stale && <p className="iw-error" role="alert">The saved wording changed while you were editing. Your draft remains here. Copy it if needed, then cancel this edit to use the latest wording before saving again.</p>}
      <div className="iw-actions"><button type="button" className="iw-primary" disabled={!mutable || stale || !value.trim() || (Boolean(currentValue) && value.trim() === currentValue)} onClick={save}>Save answer<span aria-hidden="true">→</span></button>{(draft || editing) && <button type="button" className="iw-text-button" disabled={waiting} onClick={cancelDraft}>Cancel edit</button>}<button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request(`Help our group answer Step ${phaseId}, ${labels[field] ?? field}. Ask us this question: ${question} Use the current record. Do not invent our answer.`)}>Discuss in chat</button></div>
    </div>;
  } else if (move.kind === 'chat') {
    question = move.question; hint = move.hint;
    body = <div className="iw-actions"><button type="button" className="iw-primary" disabled={!canAsk} onClick={() => request(move.kind === 'chat' ? move.prompt : '')}>Continue in the conversation<span aria-hidden="true">→</span></button></div>;
  } else if (move.kind === 'barrier') {
    const blocker = a.blockers?.[move.index];
    question = 'What kind of barrier is this?'; hint = 'Choose the main reason this information or decision is not available.';
    if (blocker) body = <div data-blocker-index={move.index}><div className="iw-factual-case"><p>{blocker.information}</p><dl><div><dt>Held by</dt><dd>{blocker.holder}</dd></div><div><dt>What prevents action</dt><dd>{blocker.barrier}</dd></div><div><dt>Possible next step</dt><dd>{blocker.unlock}</dd></div></dl></div><div className="iw-category-choices">{categories.map(category => <button type="button" key={category} aria-pressed={interaction?.barrierCategories?.[String(move.index)] === category} disabled={!canAct} onClick={() => { action({ kind: 'classify_barrier', index: move.index, category }); setCursor(null); }}>{category}</button>)}</div>{nav(a.blockers?.length ?? 0, move.index)}</div>;
  } else if (move.kind === 'tasks') {
    question = 'Which task would you make instant for this thought experiment?'; hint = 'Choose a recorded task. Next, consider what would still prevent the outcome.';
    body = <ol className="iw-timeline">{a.tasks?.map((task, index) => <li key={task.id}><button type="button" data-task-id={task.id} aria-pressed={interaction?.zeroTaskId === task.id} disabled={!canAct} onClick={() => action({ kind: 'choose_zero_task', taskId: task.id })}><span className="iw-task-number" aria-hidden="true">{index + 1}</span><strong>{task.work}</strong><span>{task.actor}</span><small>{task.friction}</small></button></li>)}</ol>;
  } else if (move.kind === 'candidate') {
    const candidate = candidates[move.index];
    const disposition = interaction?.candidateDispositions?.[candidate.id];
    question = candidate.title; hint = 'Would you keep this candidate for comparison, or change it before proceeding?';
    body = <div data-candidate-id={candidate.id}><CandidateComparison candidate={candidate} /><div className="iw-choices"><ChoiceButton title="Keep for comparison" detail="This keeps an option. It does not approve a pilot." selected={disposition === 'Keep'} disabled={!canAct} onClick={() => { action({ kind: 'candidate_disposition', candidateId: candidate.id, disposition: 'Keep' }); setCursor(null); }} /><ChoiceButton title="Reconsider this candidate" detail="Discuss what is missing or should change." selected={disposition === 'Reconsider'} disabled={!canAct} onClick={() => action({ kind: 'candidate_disposition', candidateId: candidate.id, disposition: 'Reconsider' })} /></div>{disposition === 'Reconsider' && <div className="iw-follow-up"><p>This candidate needs discussion before Step 4 can be approved.</p><button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request(`We marked candidate ${candidate.id}, “${candidate.title}”, Reconsider in Step 4. Ask us what should change, then reconcile that candidate with our answer. Do not treat the unchanged candidate as resolved.`)}>Discuss the change in chat</button></div>}{nav(candidates.length, move.index)}</div>;
  } else if (move.kind === 'priority') {
    const candidate = candidates[move.index];
    const saved = a.choices?.find(choice => choice.candidateId === candidate.id);
    const pending = interaction?.priorities?.[candidate.id];
    const selected = pending ?? saved?.decision;
    const otherFirst = candidates.find(item => item.id !== candidate.id && (interaction?.priorities?.[item.id] ?? a.choices?.find(choice => choice.candidateId === item.id)?.decision) === 'First');
    question = `Where would you place “${candidate.title}”?`; hint = 'Choose at most one candidate first. You can decide that none should be tested yet.';
    body = <div data-candidate-id={candidate.id}><CandidateComparison candidate={candidate} /><div className="iw-choices">{priorities.map(priority => <ChoiceButton key={priority} title={priority} detail={priority === 'First' && otherFirst ? `Move “${otherFirst.title}” from First before choosing this one.` : priority === 'First' ? 'Consider this for a bounded test.' : priority === 'Later' ? 'Keep it for consideration after other work or evidence.' : 'Do not take this candidate forward.'} selected={selected === priority} disabled={!canAct || (priority === 'First' && Boolean(otherFirst))} onClick={() => action({ kind: 'prioritise', candidateId: candidate.id, priority })} />)}</div>{pending && <div className="iw-follow-up"><p>“{pending}” is a proposed priority. Your reason and missing evidence still need to be recorded.</p><button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request(`We propose ${pending} for candidate ${candidate.id}, “${candidate.title}”, in Step 5. Ask for our reason and missing evidence, then save choices matching the latest visual priorities. Do not invent a reason or silently clear a pending choice.`)}>Add the reason in chat</button></div>}{saved && !pending && <details className="iw-candidate-detail"><summary>Read the saved reason</summary><p>{saved.reason}</p><p>{saved.evidenceGap}</p></details>}{nav(candidates.length, move.index)}</div>;
  } else if (move.kind === 'decision') {
    question = 'What should happen next?'; hint = 'A bounded test needs evidence and checking. You can also decide that a pilot should wait.';
    body = <div className="iw-choices"><ChoiceButton title="Test a use case" detail="Define a small test for the candidate chosen First." selected={a.decision === 'Test a use case'} disabled={!canAct} onClick={() => { action({ kind: 'set_answer', field: 'decision', value: 'Test a use case' }); setEditing(null); }} /><ChoiceButton title="Do not pilot yet" detail="Record the evidence or process work needed before reconsidering." selected={a.decision === 'Do not pilot yet'} disabled={!canAct} onClick={() => { action({ kind: 'set_answer', field: 'decision', value: 'Do not pilot yet' }); setEditing(null); }} /></div>;
  } else if (move.kind === 'pilot') {
    const eligible = candidates.filter(candidate => record?.phases[4].answers.choices?.some(choice => choice.candidateId === candidate.id && choice.decision === 'First'));
    question = 'Which candidate will the bounded test examine?'; hint = 'Only a candidate recorded as First in Step 5 can be selected.';
    body = eligible.length ? <div className="iw-choices">{eligible.map(candidate => <ChoiceButton key={candidate.id} title={candidate.title} detail={candidate.aiWork} selected={a.candidateId === candidate.id} disabled={!canAct} onClick={() => { action({ kind: 'set_answer', field: 'candidateId', value: candidate.id }); setEditing(null); }} />)}</div> : <div className="iw-follow-up"><p>No candidate is currently recorded as First. Review Step 5, or choose not to pilot yet.</p><div className="iw-actions"><button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request('We have no candidate recorded as First but selected a test in Step 6. Help us review Step 5 or decide not to pilot yet. Do not choose a candidate for us.')}>Review in chat</button><button type="button" className="iw-text-button" disabled={!canAct} onClick={() => action({ kind: 'set_answer', field: 'decision', value: 'Do not pilot yet' })}>Do not pilot yet</button></div></div>;
  } else {
    question = props.allConfirmed ? 'Your workbook is ready.' : phase?.status === 'confirmed' ? `Step ${phaseId} is in your workbook.` : `Review Step ${phaseId} together.`;
    hint = props.allConfirmed ? 'It contains the group’s approved answers and recommendation.' : phase?.status === 'confirmed' ? 'You can read the full wording below. Saving a correction will require later steps to be reviewed.' : 'Read the recorded wording before adding this step to your workbook.';
  }

  const requiredComplete = fields[phaseId].every(field => has(a[field]));
  const unresolved = phaseId === 4 && Object.values(interaction?.candidateDispositions ?? {}).includes('Reconsider') || phaseId === 5 && Object.keys(interaction?.priorities ?? {}).length > 0;
  const canConfirm = canAct && requiredComplete && !unresolved && phase?.status !== 'confirmed' && record?.phases.slice(0, phaseId - 1).every(item => item.status === 'confirmed') && move.kind === 'review';
  const statusText = phase?.status === 'confirmed' ? 'Approved' : phase?.status === 'needs_review' ? 'Needs review after an earlier change' : 'Draft';
  const summaryOpen = reviewOpen[phaseId] ?? move.kind === 'review';
  function phaseButton(target: PhaseId) { return <button key={target} type="button" disabled={waiting || dirty || target > props.activePhase} onClick={() => { props.onPhase(target); setCursor(null); setEditing(null); if (bookOpen) closeBook(); }}>Step {target}: {titles[target - 1]}<span>{record?.phases[target - 1]?.status.replace('_', ' ')}</span></button>; }

  return <div className="inline-workshop" data-step={phaseId} aria-busy={waiting}>
    {(props.notice || localError) && <div className={`iw-notice${props.noticeError || localError ? ' iw-error' : ''}`} role={props.noticeError || localError ? 'alert' : 'status'}>{localError || props.notice}</div>}
    {props.contextBlocked && <div className="iw-recovery"><p>The saved record has not yet been shared with the conversation. Edits are paused until it is synchronised.</p><button type="button" disabled={waiting} onClick={() => void run(props.onRetrySync)}>Retry sharing</button></div>}
    {props.conflict && <div className="iw-recovery"><p>A different record arrived. Edits are paused. Choose which record to continue with; this does not merge their answers.</p><p>Current: {record?.group.name ?? 'No current group'}. Incoming: {props.conflict.incoming.group.name}.</p>
      <details className="iw-conflict-comparison"><summary>Compare the current and incoming records</summary><p>The current record remains in use until you choose. Both complete records below include their group details and saved answers.</p><div>
        <section><h3>Current record{record ? `, revision ${record.revision}` : ''}</h3>{record ? <textarea aria-label="Current record for comparison" readOnly value={JSON.stringify(record, null, 2)} /> : <p>No current record has been received.</p>}</section>
        <section><h3>Incoming record, revision {props.conflict.incoming.revision}</h3><textarea aria-label="Incoming record for comparison" readOnly value={JSON.stringify(props.conflict.incoming, null, 2)} /></section>
      </div></details>
      <div className="iw-actions"><button type="button" disabled={waiting} onClick={() => void run(() => props.onResolve(false))}>Keep the current record</button><button type="button" disabled={waiting} onClick={() => void run(() => props.onResolve(true))}>Use the incoming record</button></div></div>}
    {!record ? <section className="iw-empty"><h2>{props.connected ? 'Start with your group and a work problem.' : 'Connecting to the workshop…'}</h2><p>{props.connected ? 'Tell the conversation your group name, members and the problem you want to examine. Do not include confidential or personal records.' : 'The activity will appear when the conversation shares a workshop record.'}</p>{props.connected && <button type="button" className="iw-primary" disabled={!canAsk} onClick={() => request('Help us start a workshop. Ask for our group name, members and one work problem. Do not invent the group details or include confidential records.')}>Start in the conversation</button>}</section> : <div className="iw-layout">
      <main className="iw-conversation">
        {draftHeldOpen && <p className="iw-notice" role="status">Your unsaved Step {phaseId} answer is still open. Save or cancel it before moving on. The latest saved wording is preserved in the summary below.</p>}
        {(editing || phaseId < props.activePhase) && <div className="iw-editing-notice"><p>{editing ? 'Your edit is local until you save it.' : `Reviewing Step ${phaseId}. Saving a change will mark later steps for review.`}</p>{!editing && <button type="button" disabled={waiting || dirty} onClick={() => props.onPhase(props.activePhase)}>Return to the current step</button>}</div>}
        <section className="iw-active-turn" aria-labelledby="active-question"><h2 id="active-question" ref={heading} tabIndex={-1}>{question}</h2>{hint && <p className="iw-turn-hint">{hint}</p>}{body && <div className="iw-activity">{body}</div>}</section>
        <div className="iw-progress" aria-label={`Step ${phaseId} of 6`}><span>Step {phaseId} of 6</span><div aria-hidden="true">{ids.map(id => <i key={id} className={id === phaseId ? 'current' : record.phases[id - 1].status === 'confirmed' ? 'done' : ''} />)}</div></div>
        {Object.keys(a).length > 0 && <details id="phase-review" className="iw-review" open={summaryOpen} onToggle={event => { const open = event.currentTarget.open; setReviewOpen(previous => previous[phaseId] === open ? previous : { ...previous, [phaseId]: open }); }}>
          <summary>Read the full Step {phaseId} summary <span>{statusText}</span></summary>
          {!Object.keys(a).length ? <p className="iw-small">No answers are recorded for this step yet.</p> : <dl className="iw-full-summary">{Object.entries(a).map(([field, value]) => <div key={field}><dt>{labels[field] ?? field}{(scalarFields.has(field) || field === 'decision' || (field === 'candidateId' && a.decision === 'Test a use case')) && <button type="button" disabled={!canAct} onClick={() => edit(field as keyof Answers)}>Edit<span className="iw-sr-only"> {labels[field] ?? field}</span></button>}</dt><dd><ReadValue value={value} /></dd></div>)}</dl>}
          {phaseId === 2 && interaction?.barrierCategories && <dl className="iw-read-fields">{Object.entries(interaction.barrierCategories).map(([index, category]) => <div key={index}><dt>Barrier {Number(index) + 1} classification</dt><dd>{category}</dd></div>)}</dl>}
          {phaseId === 3 && interaction?.zeroTaskId && <p className="iw-small">Task selected for the thought experiment: {a.tasks?.find(task => task.id === interaction.zeroTaskId)?.work}</p>}
          {phaseId === 4 && candidates.length > 0 && <button type="button" className="iw-text-button" disabled={!canAct} onClick={() => browse(0)}>Compare the candidates again</button>}
          {phaseId === 5 && candidates.length > 0 && <button type="button" className="iw-text-button" disabled={!canAct} onClick={() => browse(0)}>Review priorities one at a time</button>}
          {phaseId === 3 && a.tasks?.length && <button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request('Help us review the task order or choose a different recorded task for the Step 3 zero-second thought experiment. Ask what we want to change before saving.')}>Discuss the task sequence</button>}
          <button type="button" className="iw-text-button" disabled={!canAsk} onClick={() => request(`We want to correct the recorded Step ${phaseId} summary. Ask which wording or recorded item should change before saving a correction. Preserve everything else.`)}>Request a correction in chat</button>
        </details>}
        {phase?.status !== 'confirmed' && requiredComplete && !unresolved && move.kind === 'review' && <div className="iw-approval"><button type="button" className="iw-primary" disabled={!canConfirm} onClick={() => { if (canConfirm) void run(() => props.onConfirm(phaseId)); }}>Approve Step {phaseId} and add to workbook<span aria-hidden="true">→</span></button>{dirty && <p className="iw-small">Save or cancel your draft before continuing.</p>}</div>}
        {props.allConfirmed && <button type="button" className="iw-primary" onClick={openBook} disabled={!props.bookHtml}>Read your workbook<span aria-hidden="true">↗</span></button>}
        {interaction?.undo && <button type="button" className="iw-text-button iw-undo" disabled={!canAct} onClick={() => action({ kind: 'undo' }, interaction.undo?.phaseId ?? phaseId)}>Undo: {interaction.undo.label}</button>}
        {props.activePhase > 1 && <details className="iw-earlier"><summary>Review an earlier step</summary><div className="iw-step-links">{ids.filter(id => id <= props.activePhase).map(phaseButton)}</div></details>}
        <div className="iw-mobile-book"><button type="button" aria-label="Open workbook" disabled={!props.bookHtml} onClick={openBook}>Open workbook <span>{approvedCount}/6 approved</span></button></div>
      </main>
      <aside className="iw-book-preview" aria-label="Your growing workbook"><button type="button" className="iw-book-open" aria-label="Open workbook" onClick={openBook} disabled={!props.bookHtml}><span className="iw-paper-stack" aria-hidden="true"><span className="iw-paper-under" /><span className="iw-paper-cover"><span className="iw-book-title">Our AI use-case workbook</span><span className="iw-book-group">{record.group.name}</span><span className="iw-book-author">Prepared by<br />Dr. Shiva Kakkar</span></span></span><span>Open workbook</span></button><p className="iw-book-count">{approvedCount} of 6 steps approved{reviewCount > 0 ? `; ${reviewCount} need review` : ''}</p><LatestChapter record={record} /></aside>
    </div>}
    <details className="iw-backup"><summary>Connection and full text backup</summary><p>{props.connected ? 'Connected to the workshop.' : 'Waiting for a host connection.'} {record ? `Record revision ${record.revision}.` : 'No record has been received.'}</p>{record && <><button type="button" disabled={waiting} onClick={() => void run(() => props.onDownload('checkpoint'))}>Download the saved record</button><textarea aria-label="Complete JSON record" readOnly value={JSON.stringify(record, null, 2)} /></>}</details>
    <dialog id="workshop-book-dialog" className="iw-book-dialog" ref={dialogRef} onCancel={event => { event.preventDefault(); closeBook(); }} onClose={() => { if (bookOpen) closeBook(); }} aria-labelledby="book-dialog-title">
      <div className="iw-book-toolbar"><h2 id="book-dialog-title">Your workbook</h2><div><button type="button" disabled={waiting || !props.hasPdf} onClick={() => void run(() => props.onDownload('pdf'))}>Download PDF</button><button type="button" disabled={waiting || !record} onClick={() => void run(() => props.onDownload('checkpoint'))}>Save record</button><button type="button" autoFocus onClick={closeBook}>Close workbook</button></div></div>
      {props.exportFailed && <div className="iw-export-notice"><p>Your decision was saved, but the PDF could not be created.</p><button type="button" disabled={!canAct} onClick={() => void run(props.onExport)}>Retry PDF export</button></div>}
      {!props.hasPdf && !props.exportFailed && record && <div className="iw-export-notice"><p>The preview below is the current book. A PDF download is not available yet.</p><button type="button" disabled={!canAct} onClick={() => void run(props.onExport)}>Create PDF</button></div>}
      {props.bookHtml ? <iframe title="Full workshop workbook" sandbox="" srcDoc={props.bookHtml} /> : <p className="iw-turn-hint">The book preview will appear when it is returned by the workshop.</p>}
      {record && <details className="iw-book-chapters"><summary>Review a step from the workbook</summary><div className="iw-step-links">{ids.filter(id => id <= props.activePhase).map(phaseButton)}</div></details>}
    </dialog>
  </div>;
}
