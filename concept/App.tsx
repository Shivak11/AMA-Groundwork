import { useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { initialState, reducer, getStep, summary, getAnswerText } from './model';
import type { StepId, State, Option } from './model';

const stepIds: StepId[] = [1, 2, 3, 4, 5, 6];
const stepNames = ['Our goal', 'The obstacle', 'The work', 'The use case', 'Our priority', 'The next step'];
const workflow = ['CVs arrive', 'Check details', 'Gather feedback', 'Approve terms', 'Draft offer'];
const taskIds = ['', 'check-details', 'collate-feedback', '', 'draft-offer'];
type Answers = State['answers'];
const questions = [
  'How would you know hiring got faster?',
  'What is holding the offer back?',
  'What if one task took no time?',
  'Where could AI actually help?',
  'What should you try first?',
  'What would be a sensible next step?',
];
const hints = [
  'Choose a measure of progress, or KPI. You can leave the starting figure unknown.',
  'Choose the gap you would investigate first.',
  'Click a task. Consider what would still hold up the offer if this task became instant.',
  'Choose a use case to compare with a simpler process change.',
  'A use case is still a proposal. You can choose a process change or more evidence instead.',
  'Choose a small next step, including the condition that would make you stop.',
];
const shortDetails: Record<string, string> = {
  'cv-to-offer': 'From the first CV for a vacancy to its first approved offer.',
  'post-interview': 'From the selected candidate’s final interview to their approved offer.',
  'unknown-baseline': 'Agree the timestamps first. Measure the current wait before setting a target.',
  'scattered-feedback': 'Interviewers have separate notes. HR cannot tell what is final.',
  'missing-details': 'HR has to ask for information that the application should contain.',
  'approval-wait': 'Selection or pay is waiting for an authorised person to decide.',
  'test-candidate': 'Compare it with the manual method, using permitted information and a human reviewer.',
  'process-first': 'Try the shared form, checklist or approval route before adding AI.',
  'gather-evidence': 'Find out which gaps cause delays before choosing a pilot.',
};
function readback(step: StepId, answers: Answers): string {
  if (step === 1) return 'We’ll use that measure and leave the current figure unknown. Hiring checks still need to stay in place.';
  if (step === 2) return 'We’ll treat that as a possible cause. Now let’s see where it appears in the work.';
  if (step === 3) return answers[3]?.optionId === 'draft-offer' ? 'Even an instant letter still needs correct, approved terms. That is the dependency to keep in view.' : 'Completing this task instantly would still leave decisions and approvals for people. The use case needs to account for those waits.';
  if (step === 4) return 'The workbook now compares that proposal with its simpler alternative. A person remains responsible for checking the result.';
  if (step === 5) return answers[5]?.optionId === 'test-candidate' ? 'We’ll frame this as a comparison, with no assumed benefit yet.' : 'The AI proposal stays on hold. Your chosen next step goes into the recommendation.';
  return 'Your recommendation includes the next action, its limits and a condition for stopping.';
}

function ButtonMark({ selected }: { selected: boolean }) {
  return <span className={`choice-mark ${selected ? 'checked' : ''}`} aria-hidden="true">{selected ? '✓' : ''}</span>;
}

function Choice({ option, selected, onSelect, compact = false }: {
  option: Option; selected: boolean; onSelect: (id: string) => void; compact?: boolean;
}) {
  return <button type="button" aria-pressed={selected} className={`choice ${compact ? 'compact' : ''}`} onClick={() => onSelect(option.id)}>
    <span><strong>{option.title}</strong>{!compact && <span className="choice-detail">{shortDetails[option.id] ?? option.detail}</span>}</span>
    <ButtonMark selected={selected} />
  </button>;
}

function Journey({ selected, onSelect, small = false }: {
  selected?: string | null; onSelect?: (id: string) => void; small?: boolean;
}) {
  return <ol className={`journey ${small ? 'small' : ''}`} aria-label="Work from receiving CVs to drafting an approved offer for release">
    {workflow.map((work, index) => <li key={work}>
      {onSelect && taskIds[index] ? <button type="button" className="task" aria-pressed={selected === taskIds[index]} onClick={() => onSelect(taskIds[index])}>
        <span className="task-dot" aria-hidden="true" /><span>{work}</span>{selected === taskIds[index] && <span className="instant-label">Made instant</span>}
      </button> : <span className={`task fixed ${selected === taskIds[index] ? 'chosen' : ''}`}><span className="task-dot" aria-hidden="true" /><span>{work}</span></span>}
    </li>)}
  </ol>;
}

function CandidateDetail({ id }: { id: string }) {
  const options: Record<string, [string, string]> = {
    readiness: ['Flag missing evidence before an offer is drafted.', 'Use a shared readiness checklist with named approvers.'],
    'feedback-brief': ['Bring interview feedback together with links to its source.', 'Use one structured feedback form for every interviewer.'],
    completeness: ['Point out missing application details for a recruiter to check.', 'Require the same details in the application form.'],
  };
  const [ai, simpler] = options[id] ?? options.readiness;
  return <div className="comparison">
    <div><span className="comparison-label">With AI</span><p>{ai}</p></div>
    <div><span className="comparison-label">A simpler option</span><p>{simpler}</p></div>
    <p className="human-check">A person checks the evidence and makes the hiring decision.</p>
  </div>;
}

function Decision({ state, onSelect }: { state: State; onSelect: (id: string) => void }) {
  const current = getStep(state);
  if (state.step === 3) {
    return <div className="task-decision">
      <Journey selected={state.draftId} onSelect={onSelect} />
      <p className="selected-explanation" aria-live="polite">{state.draftId
        ? current.options.find(option => option.id === state.draftId)?.detail
        : 'Choose one of the three outlined tasks above.'}</p>
    </div>;
  }
  if (state.step === 4) {
    return <div>
      <div className="candidate-options">{current.options.map(option => <Choice key={option.id} compact option={option} selected={option.id === state.draftId} onSelect={onSelect} />)}</div>
      {state.draftId && <CandidateDetail id={state.draftId} />}
    </div>;
  }
  return <div className={`choices step-${state.step}`}>
    {current.options.map((option, index) => <div key={option.id} className="choice-container">
      {state.step === 2 && <span className={`barrier-line barrier-${index}`} aria-hidden="true" />}
      <Choice option={option} selected={option.id === state.draftId} onSelect={onSelect} />
    </div>)}
  </div>;
}

function StepVisual({ step, answers, miniature = false }: { step: StepId; answers: Answers; miniature?: boolean }) {
  if (step === 1) return <div className="book-outcome"><span>Fewer delays</span><span className="outcome-arrow" aria-hidden="true">→</span><span>Offer sent</span><p>Keep the required checks.</p></div>;
  if (step === 2) return <div className="book-barrier"><span>{answers[2]?.optionId === 'approval-wait' ? 'Decision pending' : answers[2]?.optionId === 'missing-details' ? 'Details missing' : 'Feedback scattered'}</span><div className="broken-link" aria-hidden="true">······</div><span>{answers[2]?.optionId === 'approval-wait' ? 'Named approver' : answers[2]?.optionId === 'missing-details' ? 'Recruiter checks' : 'Shared record'}</span></div>;
  if (step === 3) return <Journey small={miniature} selected={answers[3]?.optionId} />;
  if (step === 4) return miniature
    ? <div className="book-pair"><span>AI prepares</span><span>People check</span></div>
    : <CandidateDetail id={answers[4]?.optionId ?? 'readiness'} />;
  if (step === 5) return <div className="book-priority"><span className="priority-position">1</span><span>{answers[5]?.optionId === 'process-first' ? 'Improve the process first' : answers[5]?.optionId === 'gather-evidence' ? 'Gather evidence first' : 'Compare on a small sample'}</span></div>;
  return <div className="test-sequence"><span>Check</span><span aria-hidden="true">→</span><span>Compare</span><span aria-hidden="true">→</span><span>Decide</span></div>;
}

function BookPreview({ answers, onOpen, flash }: { answers: Answers; onOpen: () => void; flash: number }) {
  const done = stepIds.filter(step => answers[step]);
  const latest = done.at(-1);
  return <aside className="book-preview" aria-label="Your workbook preview">
    <button type="button" onClick={onOpen} className="book-open" disabled={!latest} aria-label={`Open workbook, ${done.length} of 6 steps saved`}>
      <div className="paper-stack" aria-hidden="true"><div className="paper-under" /><div className="paper-cover">
        <span className="book-cover-title">Our AI<br />use-case<br />workbook</span>
        <div className="cover-path"><span /><i /><span /><i /><span /></div>
        <span className="book-cover-group">Hiring team</span><span className="book-cover-author">Prepared by<br />Dr. Shiva Kakkar</span>
      </div></div>
      <span className="open-label">{latest ? 'Open your workbook ↗' : 'Your workbook will appear here'}</span>
    </button>
    <p className="book-count" role="status">{done.length ? `${done.length} of 6 steps saved` : 'It grows when you confirm a step.'}</p>
    {latest && <div key={flash} className="latest-page">
      <p>Step {latest}. {stepNames[latest - 1]}</p>
      <StepVisual step={latest} answers={answers} miniature />
    </div>}
  </aside>;
}

function Workbook({ state, title, group, onClose }: { state: State; title: string; group: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { if (node?.open) node.close(); };
  }, []);
  const done = stepIds.filter(step => state.answers[step]);
  return <dialog ref={dialog} className="workbook-dialog" onCancel={onClose}>
    <header className="book-toolbar"><p>Your workbook <span>{done.length} of 6 steps</span></p><div><button type="button" onClick={() => window.print()}>Print / save PDF</button><button type="button" onClick={onClose}>Close</button></div></header>
    <div className="book-pages">
      <section className="book-page cover-page">
        <h1>{title.trim() || 'Our AI use-case workbook'}</h1><p>From receiving CVs to sending an offer</p>
        <div className="cover-journey" aria-hidden="true"><span>CV</span><i /><span>Review</span><i /><span>Offer</span></div>
        <div className="cover-group"><h2>Hiring team</h2><p>{group.trim() || 'A fictional group exercise'}</p></div>
        <p className="cover-credit">Prepared by Dr. Shiva Kakkar</p>
        <p className="fiction-note">Fictional practice case · {done.length} of 6 steps completed</p>
      </section>
      {done.map(step => {
        const content = summary(step, state.answers);
        return <section key={step} className="book-page content-page">
          <h2>Step {step}. {stepNames[step - 1]}</h2>
          <h3>{content.title}</h3>
          <StepVisual step={step} answers={state.answers} />
        <p className="book-detail">{content.detail}</p>
          {step === 1 && <p className="book-caution">The current baseline has not been measured. This is a proposed measure, not evidence of improvement.</p>}
          {step === 6 && <p className="book-caution">The next-step owner and access permissions still need confirmation. No participant or applicant data was used in this concept.</p>}
          <footer><a href="https://www.shivakakkar.com/">Prepared by Dr. Shiva Kakkar</a><span>{step + 1}</span></footer>
        </section>;
      })}
    </div>
  </dialog>;
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [noteOpen, setNoteOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [title, setTitle] = useState('Our AI use-case workbook');
  const [group, setGroup] = useState('');
  const [showEarlier, setShowEarlier] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState<State | null>(null);
  const current = getStep(state);
  const completed = stepIds.filter(step => state.answers[step]);
  const active = useRef<HTMLElement>(null);
  const bookReturnFocus = useRef<HTMLElement | null>(null);
  const flash = completed.length;

  useEffect(() => {
    if (completed.length || state.complete) {
      active.current?.focus({ preventScroll: true });
      active.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [state.step, state.complete]);

  function confirm() {
    dispatch({ type: 'confirm' });
    setNoteOpen(false);
    setEditingSnapshot(null);
  }
  function edit(step: StepId) {
    setEditingSnapshot(structuredClone(state));
    dispatch({ type: 'edit', step });
    setNoteOpen(Boolean(state.answers[step]?.note));
  }
  function cancelEdit() {
    if (editingSnapshot) dispatch({ type: 'restore', state: editingSnapshot });
    setEditingSnapshot(null);
    setNoteOpen(false);
  }
  function openBook() {
    bookReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setBookOpen(true);
  }
  function closeBook() {
    setBookOpen(false);
    setTimeout(() => bookReturnFocus.current?.focus(), 0);
  }
  function onNoteKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && state.draftId) confirm();
  }
  const visibleCompleted = showEarlier ? completed : completed.slice(-1);

  return <>
    <header className="prototype-header"><div><h1>AI workshop conversation</h1><p>Try this fictional hiring example. Replies are scripted in this concept.</p></div><button type="button" className="quiet-button" onClick={() => { dispatch({ type: 'restart' }); setNoteOpen(false); setShowEarlier(false); setEditingSnapshot(null); window.scrollTo(0, 0); }}>Start again</button></header>
    <div className="workshop-layout">
      <main className="conversation" aria-label="Workshop conversation">
        <div className="user-message first-message"><p>We want to reduce the delays between receiving a CV and sending an offer.</p></div>
        {completed.length > 1 && <button className="earlier-button" type="button" onClick={() => setShowEarlier(!showEarlier)} aria-expanded={showEarlier}>{showEarlier ? 'Hide earlier answers' : `Read ${completed.length - 1} earlier ${completed.length === 2 ? 'answer' : 'answers'}`}</button>}
        <div className="conversation-history">
          {visibleCompleted.map(step => <div className="exchange" key={step}>
            <div className="user-message"><p>{getAnswerText(step, state.answers)}</p><button type="button" onClick={() => edit(step)} aria-label={`Edit Step ${step}: ${stepNames[step - 1]}`}>Edit</button></div>
            <div className="assistant-summary"><p>{readback(step, state.answers)}</p><span>Step {step} saved to your workbook.</span></div>
          </div>)}
        </div>
        {!state.complete ? <section ref={active} tabIndex={-1} className="active-turn" aria-labelledby="active-question">
          {editingSnapshot && <div className="editing-notice"><p>Editing Step {state.step}. Later steps will need review.</p><button type="button" onClick={cancelEdit}>Cancel edit</button></div>}
          <h2 id="active-question">{questions[state.step - 1]}</h2>
          <p className="turn-hint">{hints[state.step - 1]}</p>
          <div className="inline-activity">
            <Decision state={state} onSelect={id => dispatch({ type: 'select', id })} />
            <div className="activity-actions">
              <button type="button" className="note-toggle" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>{noteOpen ? 'Hide note' : 'Add something in your own words'}</button>
              <button type="button" className="primary-button" disabled={!state.draftId} onClick={confirm}>{current.button}<span aria-hidden="true">→</span></button>
            </div>
            {noteOpen && <div className="note-editor"><label htmlFor="group-note">What would you add or change?</label><textarea id="group-note" value={state.note} maxLength={1200} onKeyDown={onNoteKey} onChange={event => dispatch({ type: 'note', value: event.currentTarget.value })} placeholder="Your note will be saved alongside this choice." /><p>This prototype saves your wording. It does not generate a reply to it.</p></div>}
          </div>
          <div className="quiet-progress" aria-label={`Step ${state.step} of 6`}><span>Step {state.step} of 6</span><div aria-hidden="true">{stepIds.map(step => <i key={step} className={step < state.step ? 'done' : step === state.step ? 'current' : ''} />)}</div></div>
        </section> : <section ref={active} tabIndex={-1} className="active-turn finished" aria-labelledby="finished-title">
          <h2 id="finished-title">Your workbook is ready.</h2>
          <p className="turn-hint">It includes your goal, the work you examined and the next step you chose.</p>
          <div className="completion-path"><StepVisual step={3} answers={state.answers} /><p>{summary(6, state.answers).title}</p></div>
          <div className="book-personalise"><label htmlFor="book-title">Give your workbook a name</label><input id="book-title" maxLength={100} value={title} onChange={event => setTitle(event.currentTarget.value)} /><label htmlFor="group-members">Group members <span>(optional)</span></label><input id="group-members" maxLength={180} value={group} onChange={event => setGroup(event.currentTarget.value)} placeholder="Add the names you want on the cover" /></div>
          <button type="button" className="primary-button" onClick={openBook}>Read your workbook<span aria-hidden="true">↗</span></button>
        </section>}
        <div className="mobile-book"><button type="button" disabled={!completed.length} onClick={openBook}>Open your workbook <span>{completed.length}/6</span></button></div>
      </main>
      <BookPreview answers={state.answers} flash={flash} onOpen={openBook} />
    </div>
    <footer className="prototype-footer">Prepared by Dr. Shiva Kakkar. This local concept does not send or save your answers outside this page.</footer>
    {bookOpen && <Workbook state={state} title={title} group={group} onClose={closeBook} />}
  </>;
}
