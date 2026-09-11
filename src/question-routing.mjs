// The host collects answers. Embedded views only display saved snapshots.
export const CHAT_QUESTION_POLICY = 'The host conversation owns every workshop question and approval. Prefer an available native question tool (ask_user_question, AskUserQuestion or equivalent) for one focused decision with helpful context-grounded options. Always allow a different answer or uncertainty. If the host has no native question tool, it is disabled, or its call is rejected, ask the same single question in ordinary chat with numbered options when useful. Do not retry an unavailable tool or simulate it with an embedded form. Use ordinary chat for open explanations. Never ask the same question in both a native card and chat. Wait for the answer before the next question.';
export const SERVER_QUESTION_POLICY = `${CHAT_QUESTION_POLICY} The MCP workbook is read-only; it never asks, saves or approves. Use the complete latest record returned by a workshop tool, never an older card or a reconstructed narrative summary. Preserve agreed wording and omitted fields. Save each agreed answer with save_workshop_phase; then show_workbook after a meaningful decision or at the group's request. Do not render a new workbook before every question. Confirmation and export already include a visual, so do not call show_workbook again for the same checkpoint. A saved answer, native option selection or request to continue is not phase approval. Ask for explicit approval of the completed summary before confirm_workshop_phase. Higher-priority host instructions and permission controls still apply. The server cannot call or guarantee availability of a host-owned question tool.`;

export function questionTurn(record, nextQuestion, turnId, purpose = 'conversation') {
  return {
    owner: 'chat', turnId,
    recordRevision: record.revision,
    phaseId: record.phases.find(phase => phase.status !== 'confirmed')?.id ?? 6,
    hostAction: purpose === 'files' ? 'deliver_files' : nextQuestion.kind === 'complete' ? 'offer_workbook' : 'ask_one_in_host',
    preferredInput: 'native_question_tool', fallbackInput: 'plain_chat',
    field: nextQuestion.field ?? null,
    question: purpose === 'files' ? null : nextQuestion.question,
    instruction: purpose === 'files' ? 'Deliver the existing PDF and JSON through normal file links. This request does not ask to resume the questionnaire.' : CHAT_QUESTION_POLICY,
  };
}
