// This controls where questions are asked, not the participant's saved answers.
export const UI_QUESTION_POLICY = 'The embedded activity owns the current question and approval controls. Wait for the participant to answer there. Do not ask another question in chat or call ask_user_question, AskUserQuestion, request_user_input, elicitation or another host-native questionnaire while the activity owns this turn. Use present_workshop_question only to place helpful options in that same activity, then stop and wait. Do not repeat its question, choices or approval request in chat. A visual save or context update is not a request for another question.';
export const CHAT_QUESTION_POLICY = 'Chat owns this turn because the participant explicitly handed it over or chose text participation. The activity must remain paused. Ask only one question in the conversation, reuse recorded answers and save only agreed wording. Use mode="text" while gathering the answer. Return ownership with workshop_next or present_workshop_question in mode="auto" when ready to use the activity again; then stop asking in chat.';
export const SERVER_QUESTION_POLICY = `The workshop has exactly one active question owner. Follow structuredContent.questionTurn and the latest app model-context update. If questionTurn.owner is "ui": ${UI_QUESTION_POLICY} If questionTurn.owner is "chat": ${CHAT_QUESTION_POLICY} Before a group record exists, collect its details in one conversational surface. Higher-priority host instructions and permission controls still apply; this connector does not disable host tools. Never infer participant approval from a handoff, visual selection or request to continue.`;

export function questionTurn(record, owner, turnId) {
  return {
    owner,
    ...(turnId ? {turnId} : {}),
    recordRevision: record.revision,
    phaseId: record.phases.find(phase => phase.status !== 'confirmed')?.id ?? 6,
    hostAction: owner === 'ui' ? 'wait_for_activity' : 'ask_one_in_chat',
    instruction: owner === 'ui' ? UI_QUESTION_POLICY : CHAT_QUESTION_POLICY,
  };
}

export function contextForQuestionOwner(data, owner, turnId = data.questionTurn?.turnId) {
  const turn = questionTurn(data.record, owner, turnId);
  return {
    ...data, questionTurn: turn, mode: owner === 'ui' ? 'ui-available' : 'text',
    ...(owner === 'ui' ? {
      next: UI_QUESTION_POLICY,
      phase: {...data.phase, question: null, instructions: UI_QUESTION_POLICY},
    } : {
      next: [CHAT_QUESTION_POLICY, data.next === UI_QUESTION_POLICY ? '' : data.next].filter(Boolean).join('\n'),
      phase: {...data.phase, instructions: [CHAT_QUESTION_POLICY, data.phase?.instructions === UI_QUESTION_POLICY ? '' : data.phase?.instructions].filter(Boolean).join('\n')},
    }),
  };
}
