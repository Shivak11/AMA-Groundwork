export type StepId = 1 | 2 | 3 | 4 | 5 | 6;
export type Option = { id: string; title: string; detail: string };
export type Step = { id: StepId; title: string; question: string; hint: string; options: Option[]; button: string };
export type Answer = { optionId: string; note: string };
export type State = { step: StepId; answers: Partial<Record<StepId, Answer>>; draftId: string | null; note: string; complete: boolean };
export type Action = { type: 'select'; id: string } | { type: 'note'; value: string } | { type: 'confirm' } | { type: 'edit'; step: StepId } | { type: 'restore'; state: State } | { type: 'restart' };
type Answers = State['answers'];

export const initialState: State = { step: 1, answers: {}, draftId: null, note: '', complete: false };
const ids: StepId[] = [1, 2, 3, 4, 5, 6];
const option = (id: string, title: string, detail: string): Option => ({ id, title, detail });
const candidateNames: Record<string, string> = {
  readiness: 'Offer-readiness check',
  'feedback-brief': 'Source-linked feedback brief',
  completeness: 'Application completeness check',
};
function candidate(answers: Answers): string {
  return candidateNames[answers[4]?.optionId ?? ''] ?? 'the proposed use case';
}
function measure(answers: Answers): string {
  return answers[1]?.optionId === 'post-interview' ? 'post-interview-to-offer working days' : 'CV-to-offer working days';
}
function candidateOptions(answers: Answers): Option[] {
  const options = [
    option('readiness', candidateNames.readiness, 'Flag missing feedback or approval before HR prepares the offer. Compare with a shared readiness checklist and named approvers. AI cannot grant approval.'),
    option('feedback-brief', candidateNames['feedback-brief'], 'Bring recorded feedback together with links to its sources. The panel checks the brief and decides. Compare with a shared feedback form.'),
    option('completeness', candidateNames.completeness, 'Check whether agreed application details are present. HR verifies each flag. Compare with mandatory form fields; do not score, rank or reject applicants.'),
  ];
  const first = answers[2]?.optionId === 'scattered-feedback' ? 'feedback-brief' : answers[2]?.optionId === 'missing-details' ? 'completeness' : 'readiness';
  return [...options.filter(item => item.id === first), ...options.filter(item => item.id !== first)];
}
function testOptions(answers: Answers): Option[] {
  if (answers[5]?.optionId === 'process-first') return [
    option('shared-checklist', 'Try the shared checklist', 'Use fictional pre-offer files to check required details, feedback and approval. HR verifies every result. Stop if missing approval is treated as complete.'),
    option('named-approvers', 'Agree who can approve', 'Ask HR and the authorised decision-makers to agree the approval route, then replay a fictional case. Stop if the route bypasses a required hiring check.'),
    option('pause-process', 'Wait for an accountable owner', 'Do not change the process until an owner and review point are agreed. Reconsider only when responsibility and the required permissions are clear.'),
  ];
  if (answers[5]?.optionId === 'gather-evidence') return [
    option('timestamp-review', 'Check where the waiting occurs', `Review permitted timestamps for ${measure(answers)}, keeping open cases visible. Begin with fictional records. Stop if the start and end cannot be linked reliably.`),
    option('gap-review', 'Check which gaps recur', 'Manually inspect fictional files for missing details, feedback and approval. Stop if records do not support a consistent account of the gaps.'),
    option('permission-first', 'Resolve permission before sampling', 'Ask the information owner to agree permitted inputs, redaction and retention. Do not sample real records until that route is approved. Stop if personal information cannot be protected.'),
  ];
  return [
    option('fictional-comparison', 'Compare on fictional files', `Compare ${candidate(answers).toLowerCase()} with its manual alternative on the same pre-offer snapshots. Keep known omissions in a separate answer key. Stop if it invents approval or misses a required check.`),
    option('authorised-comparison', 'Plan a permitted redacted comparison', 'Seek permission before using redacted records in an approved environment. Compare accuracy and total checking effort with the manual method. Stop if privacy or required approvals cannot be verified.'),
    option('defer-test', 'Do not run an AI test yet', 'Keep the proposed use case for review. Do not start while permission, the manual comparison or the person responsible for checking remains unresolved.'),
  ];
}

function stepFor(id: StepId, answers: Answers): Step {
  switch (id) {
    case 1: return {
      id, title: 'What should improve?',
      question: 'We want correct, approved offers to reach candidates sooner. What will we measure?',
      hint: 'Choose evidence of less waiting, without weakening hiring checks. The fictional case has no measured baseline.',
      options: [
        option('cv-to-offer', 'CV-to-offer days', 'Count working days from the first CV received for a vacancy to its first approved offer release. Track vacancies with no offer separately.'),
        option('post-interview', 'Post-interview-to-offer days', 'Count working days from the final interview of the candidate receiving the first offer to that same candidate’s approved offer release.'),
        option('unknown-baseline', 'The starting point is unknown', 'Agree the CV-to-offer timestamps and establish the current waiting time before setting a target. An unknown baseline does not mean the delay is zero.'),
      ], button: 'Use this measure',
    };
    case 2: return {
      id, title: 'What is holding the offer back?',
      question: `Which gap would you investigate first to understand ${measure(answers)}?`,
      hint: 'Choose a starting hypothesis for this fictional case. A connector can expose information but cannot provide someone’s approval.',
      options: [
        option('scattered-feedback', 'Feedback is scattered', 'Interviewers hold separate notes, and HR cannot tell what is final. A shared feedback form and an agreed deadline may help.'),
        option('missing-details', 'Application details are missing', 'HR has to ask for information that the application should contain. Agree the required fields before proposing an AI check.'),
        option('approval-wait', 'The offer is waiting for approval', 'The authorised people must confirm selection and pay. Name the approvers and a follow-up route; access to the file does not transfer their authority.'),
      ], button: 'Investigate this gap',
    };
    case 3: return {
      id, title: 'What if this task took no time?',
      question: 'Follow the CV-to-offer journey. Choose one task to make instant in your thought experiment.',
      hint: 'The journey is CV receipt, checking details, interviewing, approving terms and releasing the offer. No duration has been measured.',
      options: [
        option('check-details', 'Checking application details', 'Even an instant completeness check would leave the interview and offer checks. It would not remove a wait for approval or supply the authority to decide.'),
        option('collate-feedback', 'Collating interview feedback', 'Instantly assembling notes would still leave missing feedback or disagreement for people to resolve. It would not remove the approval or authority wait.'),
        option('draft-offer', 'Drafting the offer', 'An instant letter would still need correct, authorised terms. It would not remove the approval wait or give HR authority that has not been granted.'),
      ], button: 'Record what still remains',
    };
    case 4: return {
      id, title: 'Which use case is worth examining?',
      question: 'Choose a proposal that addresses the gap you recorded, and compare it with the simpler fix.',
      hint: 'The closest option is shown first. People retain shortlisting, selection, pay and offer-release decisions.',
      options: candidateOptions(answers), button: 'Examine this use case',
    };
    case 5: return {
      id, title: 'What should happen first?',
      question: `Is ${candidate(answers).toLowerCase()} ready for a comparison, or should something else happen first?`,
      hint: 'Choosing a candidate does not commit the group to using AI. Its benefit, checking effort and cost are still unknown.',
      options: [
        option('test-candidate', 'Compare the selected use case', `Propose a bounded comparison of ${candidate(answers).toLowerCase()} with its manual alternative. Keep permission and human checking as prerequisites.`),
        option('process-first', 'Try the process change first', 'Start with the shared form, checklist or named approval route. Keep the AI proposal on hold until there is a problem the simpler change cannot address.'),
        option('gather-evidence', 'Gather evidence before deciding', `Check which gaps actually affect ${measure(answers)}. Do not start an AI pilot on the strength of this fictional replay alone.`),
      ], button: 'Use this priority',
    };
    case 6: return {
      id, title: 'What can we responsibly recommend?',
      question: answers[5]?.optionId === 'process-first' ? 'How will you check the process change before considering AI?'
        : answers[5]?.optionId === 'gather-evidence' ? 'Which evidence will you seek before making a pilot decision?'
          : 'How will you compare the proposal without assuming it already works?',
      hint: 'Use fictional information here. Do not upload real CVs. Real redacted records need an approved route and a person who checks the result.',
      options: testOptions(answers), button: 'Finish our recommendation',
    };
  }
}

export function getStep(state: State): Step { return stepFor(state.step, state.answers); }
function chosen(step: StepId, answers: Answers): Option | undefined {
  return stepFor(step, answers).options.find(item => item.id === answers[step]?.optionId);
}
export function reducer(state: State, action: Action): State {
  if (action.type === 'restart') return { ...initialState, answers: {} };
  if (action.type === 'restore') return structuredClone(action.state);
  if (action.type === 'edit') {
    if (!ids.includes(action.step) || action.step > state.step || (!state.answers[action.step] && action.step !== state.step)) return state;
    const previous = state.answers[action.step];
    const answers: Answers = {};
    ids.filter(id => id < action.step).forEach(id => { if (state.answers[id]) answers[id] = { ...state.answers[id]! }; });
    return { step: action.step, answers, draftId: previous?.optionId ?? (action.step === state.step ? state.draftId : null), note: previous?.note ?? (action.step === state.step ? state.note : ''), complete: false };
  }
  if (state.complete) return state;
  if (action.type === 'select') return getStep(state).options.some(item => item.id === action.id) ? { ...state, draftId: action.id } : state;
  if (action.type === 'note') return { ...state, note: action.value };
  if (action.type === 'confirm') {
    if (!state.draftId || !getStep(state).options.some(item => item.id === state.draftId)) return state;
    if (ids.some(id => id < state.step && !chosen(id, state.answers))) return state;
    const answers: Answers = { ...state.answers, [state.step]: { optionId: state.draftId, note: state.note.trim() } };
    if (state.step === 6) return { ...state, answers, draftId: null, note: '', complete: true };
    return { step: (state.step + 1) as StepId, answers, draftId: null, note: '', complete: false };
  }
  return state;
}
export function getAnswerText(step: StepId, answers: Answers): string {
  const selection = chosen(step, answers);
  if (!selection) return 'Not decided yet.';
  const note = answers[step]?.note.trim();
  return `${selection.title}${note ? `\n${note}` : ''}`;
}
export function summary(step: StepId, answers: Answers): { title: string; detail: string } {
  const selection = chosen(step, answers);
  if (!selection) return { title: stepFor(step, answers).title, detail: 'This step has not been confirmed.' };
  let title = selection.title;
  let detail = selection.detail;
  if (step === 1) {
    title = 'Reduce waiting for correct, approved offers';
    detail += ' Keep the baseline and target unknown until records support them. Preserve hiring checks, fair treatment and correct offer terms.';
  }
  if (step === 2) detail += ` Investigate its effect on ${measure(answers)} before treating it as the main cause.`;
  if (step === 3) title = `If ${selection.title.toLowerCase()} took no time`;
  if (step === 4) detail += ` Check whether this changes the gap behind ${measure(answers)}. No improvement has been demonstrated.`;
  if (step === 5 && selection.id !== 'test-candidate') detail += ` The recorded AI candidate is ${candidate(answers).toLowerCase()}, but no AI pilot is recommended at this stage.`;
  if (step === 6) {
    detail += ' The HR lead is a proposed reviewer, subject to agreement. People retain selection, pay and release authority.';
    if (answers[5]?.optionId === 'test-candidate' && selection.id !== 'defer-test') detail += ` Review missed or incorrect flags, total preparation and checking effort, and model cost before any use. A retrospective comparison cannot prove shorter ${measure(answers)}; that needs a separately permitted live comparison.`;
    else detail += ' No AI pilot is approved by this recommendation. Revisit the decision only when the stated evidence or permission is available.';
    detail += ' No real CVs are uploaded and no savings are claimed.';
  }
  const note = answers[step]?.note.trim();
  return { title, detail: `${detail}${note ? `\n\n${note}` : ''}` };
}
