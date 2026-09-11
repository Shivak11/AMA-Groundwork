import {group as classroomGroup,answers as classroomAnswers} from './remote-team.mjs';

// This fixture tests saved-workbook recovery. It contains no actual employee data.
// Only Group 1A, its members and the original problem came from Shiva.
export const group=structuredClone(classroomGroup);
export const answers=structuredClone(classroomAnswers);
export const approval='Group 1A explicitly approves this complete saved fictional summary.';
export const candidateCorrection={
  humanCheck:'The employee checks and corrects every proposed clarification before choosing what to submit. The manager checks the source-linked account and retains all decisions. Do not send messages, rank people or escalate automatically.',
};
export const renamedGroup={name:'1A — Remote team updates'};
export const noPilotAnswers={
  ...structuredClone(answers[5]),
  decision:'Do not pilot yet',
  candidateId:null,
  recommendation:'Agree the checkpoint and compare the simple structured form using fictional updates first. There is no measured need for an AI pilot yet. Keep all people and dependency decisions with the manager.',
};
