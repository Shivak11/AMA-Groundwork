import { z } from 'zod';
import { validateRecord, currentPhase, answerSchemas } from './workshop.mjs';
import { applyWorkshopAction } from './actions.mjs';

export const presentationSchema = z.object({
  phaseId:z.number().int().min(1).max(6), field:z.string().min(1).max(80),
  question:z.string().trim().min(1).max(240), hint:z.string().trim().max(400).optional(),
  choices:z.array(z.object({label:z.string().trim().min(1).max(100),value:z.string().trim().min(1).max(1200).nullable()}).strict()).min(1).max(4),
}).strict();

export function validatePresentation(input, proposed) {
  const record=validateRecord(input), question=presentationSchema.parse(proposed);
  if(currentPhase(record)!==question.phaseId) throw new Error('Present one question for the current unconfirmed step.');
  const textFields=['outcome','kpi','baseline','guardrail','hypothesis','firstGap','chosenWorkflow','recentCase','zeroSecond','redesign','challenge','costs','owner','evidence','peopleChange','test','stopRule','recommendation'];
  if(!textFields.includes(question.field)) throw new Error('Use a free-text answer field for suggested wording. Recorded decisions and candidates have their own visual controls.');
  const schema=answerSchemas[question.phaseId-1].shape[question.field];
  if(!schema || !Object.hasOwn(answerSchemas[question.phaseId-1].shape,question.field)) throw new Error('Choose an answer field from the current step.');
  if(new Set(question.choices.map(choice=>choice.label)).size!==question.choices.length) throw new Error('Give each proposed choice a distinct label.');
  if(new Set(question.choices.map(choice=>JSON.stringify(choice.value))).size!==question.choices.length) throw new Error('Do not repeat the same proposed answer.');
  for(const choice of question.choices) {
    schema.parse(choice.value);
    // Validate references and phase constraints without adopting the hypothetical
    // record. Presenting a choice never saves or approves it.
    applyWorkshopAction(record,{kind:'set_answer',phaseId:question.phaseId,expectedRevision:record.revision,field:question.field,value:choice.value});
  }
  return question;
}
