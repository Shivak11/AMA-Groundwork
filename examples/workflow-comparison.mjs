import {createRecord, savePhase, confirmPhase} from '../src/workshop.mjs';
import {group, deferredAnswers, approval} from './remote-team.mjs';

// Synthetic correspondences for the synthetic remote-team case. Each proposed
// alternative remains separate; this does not assert a real team's agreement.
export const mappings = [
  {candidateId:'c1',stages:[
    {taskIds:['t1'],proposedStepIndices:[]},
    {taskIds:['t3'],proposedStepIndices:[0]},
    {taskIds:['t4'],proposedStepIndices:[1,2,3,4]},
  ]},
  {candidateId:'c2',stages:[
    {taskIds:['t3'],proposedStepIndices:[0]},
    {taskIds:['t4'],proposedStepIndices:[1,2]},
    {taskIds:['t5'],proposedStepIndices:[3]},
  ]},
];
export function comparisonExample({confirm=true}={}) {
  let record=createRecord(group);
  for(let id=1;id<=5;id++)record=confirmPhase(savePhase(record,id,deferredAnswers[id-1]),id,approval);
  record=savePhase(record,6,{recommendation:deferredAnswers[5].recommendation,workflowComparisons:mappings});
  return confirm?confirmPhase(record,6,approval):record;
}
