// The host collects answers. Embedded views only display saved snapshots.
export const PARTICIPANT_LANGUAGE_POLICY = 'Use natural, connected, everyday English for managers. Ask one short question and only the context needed to answer it. Do not narrate activation, Cloudflare, schemas, storage, record revisions, checkpoints or private references in normal conversation. Explain access or retention accurately if asked; never hide a relevant risk. Use full task and use-case names in every question and option. If showing an ID, place it after the name, never alone. Every option must make sense without remembering earlier messages; avoid Both first, c2 then c1 or unexplained threshold language. Intuitive comparison headings are Use case, Workflow task, What AI does, What a person checks, Without AI, and What needs checking. Reuse supplied answers, capture the date automatically, and ask only for roll/group number, members and the problem at the start. Never expose private editing keys in participant prose.';
export const COMPLETION_POLICY = 'After all six steps are approved, stop the questionnaire. Give a brief recap naming the identified AI use cases, how they address the agreed problem, and the group recommendation. Retain all identified cases even if none will be piloted. Open the completed workbook inline and provide a prominent working Download PDF action. Say: Your use cases and recommendation are documented in this workbook. You can keep it for reflection and return to it when you decide to implement. Do not offer to build or run anything, ask for another test decision, or discuss storage and recovery mechanics.';
export const CHAT_QUESTION_POLICY = 'The host conversation owns every workshop question and approval. Prefer an available native question tool (ask_user_question, AskUserQuestion or equivalent) for one focused decision with helpful context-grounded options. Always allow a different answer or uncertainty. If the participant requests ordinary chat, use mode:text for subsequent workshop calls until they change that preference. If the host has no native question tool, it is disabled, or its call is rejected, ask the same single question in ordinary chat with numbered options when useful. Do not retry an unavailable tool or simulate it with an embedded form. Use ordinary chat for open explanations. Never ask the same question in both a native card and chat. Wait for the answer before the next question.';
const TEXT_QUESTION_POLICY = 'Ask one focused question in ordinary chat. The participant requested text mode: do not call a native question tool or display an answer form. Use short numbered options when useful, and allow a different answer or uncertainty. Wait for their answer. Keep mode:text on later calls until the participant changes this preference.';
export const SERVER_QUESTION_POLICY = `${CHAT_QUESTION_POLICY} The MCP workbook is read-only; it never asks, saves or approves. Use the complete latest record returned by a workshop tool, never an older card or a reconstructed narrative summary. Preserve agreed wording and omitted fields. Save each agreed answer with save_workshop_phase; then show_workbook after a meaningful decision or at the group's request. Do not render a new workbook before every question. Confirmation and export already include a visual, so do not call show_workbook again for the same checkpoint. A saved answer, native option selection or request to continue is not phase approval. Ask for explicit approval of the completed summary before confirm_workshop_phase. Higher-priority host instructions and permission controls still apply. The server cannot call or guarantee availability of a host-owned question tool.`;

export function questionTurn(record, nextQuestion, turnId, purpose = 'conversation', mode = 'auto') {
  const phaseId = record.phases.find(phase => phase.status !== 'confirmed')?.id ?? 6;
  const afterReply = purpose === 'files' || nextQuestion.kind === 'complete' ? null : nextQuestion.kind === 'approval' ? {
    tool: 'confirm_workshop_phase',
    phaseId,
    field: null,
    instruction: `After the group explicitly approves the Step ${phaseId} summary, call confirm_workshop_phase for Step ${phaseId}. Check saveReceipt before continuing.`,
  } : {
    tool: 'save_workshop_phase',
    phaseId,
    field: nextQuestion.field ?? null,
    instruction: `After the participant answers this question, call save_workshop_phase for Step ${phaseId}${nextQuestion.field ? ` and the ${nextQuestion.field} field` : ''} before asking another workshop question. Check saveReceipt before continuing.`,
  };
  return {
    owner: 'chat', turnId,
    recordRevision: record.revision,
    phaseId,
    hostAction: purpose === 'files' ? 'deliver_files' : nextQuestion.kind === 'complete' ? 'offer_workbook' : 'ask_one_in_host',
    preferredInput: mode === 'text' ? 'plain_chat' : 'native_question_tool', fallbackInput: 'plain_chat',
    field: nextQuestion.field ?? null,
    question: purpose === 'files' ? null : nextQuestion.question,
    afterReply,
    instruction: `${PARTICIPANT_LANGUAGE_POLICY} ${nextQuestion.kind==='complete'?COMPLETION_POLICY:purpose==='files'?'Deliver the existing workbook and PDF through normal file links. Do not resume the questionnaire or narrate technical file details.':mode==='text'?TEXT_QUESTION_POLICY:CHAT_QUESTION_POLICY}`,
  };
}
