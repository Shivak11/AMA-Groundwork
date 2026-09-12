import type { Candidate, WorkshopRecord } from './inline-types';
import { buildWorkflowComparisons } from './workflow-comparison.mjs';

type Activity = {actor:string; action:string};
type Comparison = {
  candidateId:string; title:string; mode:string; review:boolean;
  stages:{current:Activity[]; proposed:Activity[]}[];
  current:Activity[]; proposed:Activity[]; humanCheck:string;
  components:NonNullable<Candidate['implementation']>['components'];
  output?:string; priority?:string;
};

function Activities({steps, label, empty}:{steps:Activity[]; label:string; empty:string}) {
  if (!steps.length) return <p className="wfc-empty">{empty}</p>;
  return <ol className="wfc-activities" aria-label={label}>{steps.map((step,index)=><li key={index} className="wfc-activity-step">
    <div className={`wfc-activity${step.actor==='AI'?' wfc-ai':''}`} data-actor={step.actor}><p className="wfc-actor">{step.actor}</p><p className="wfc-action">{step.action}</p></div>
    {index<steps.length-1 && <svg className="wfc-arrow" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false"><path d="M10 2v18M4 14l6 6 6-6" /></svg>}
  </li>)}</ol>;
}

export function WorkflowComparison({comparison}:{comparison:Comparison}) {
  const c=comparison;
  return <section className="wfc-comparison" data-comparison-mode={c.mode} data-comparison-candidate={c.candidateId} aria-label={`Current and proposed workflow for ${c.title}`}>
    <p className="wfc-scope">{c.mode==='aligned' ? 'Each row compares related current tasks with the proposed activities.' : 'Related current tasks and proposed work are shown as separate sequences.'}</p>
    {c.review && <p className="wfc-review">This comparison needs the group's review.</p>}
    {c.mode==='aligned' ? <table className="wfc-matrix" role="table">
      <caption>Current and proposed activities for {c.title}</caption>
      <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Related current work</th><th scope="col" role="columnheader">Proposed work</th></tr></thead>
      <tbody role="rowgroup">{c.stages.map((stage,index)=><tr role="row" key={index} data-comparison-stage={index+1}>
        <td role="cell"><p className="wfc-mobile-label">Current work</p><Activities steps={stage.current} label={`Current activities in comparison row ${index+1}`} empty="Added step" /></td>
        <td role="cell"><p className="wfc-mobile-label">Proposed work</p><Activities steps={stage.proposed} label={`Proposed activities in comparison row ${index+1}`} empty="Not included in this proposal" /></td>
      </tr>)}</tbody>
    </table> : <>
      <div className="wfc-sequences">
        <section><h4>Related current work</h4><Activities steps={c.current} label="Related current sequence" empty="Related current tasks are not recorded in this workbook." /></section>
        <section><h4>Proposed work</h4><Activities steps={c.proposed} label="Proposed sequence" empty="A proposed sequence is not recorded in this workbook." /></section>
      </div>
    </>}
    {c.humanCheck && <div className="wfc-human-check"><h4>Human check</h4><p>{c.humanCheck}</p></div>}
    {c.output && <div className="wfc-output"><h4>What someone receives</h4><p>{c.output}</p></div>}
    {c.components.length>0 && <section className="wfc-components"><h4>Proposed components for this use case</h4><ul>{c.components.map((component,index)=><li key={index}>
      <p className="wfc-component-name"><span className="wfc-component-kind">{component.kind}</span><span>{component.status}</span></p>
      <p>{component.purpose}</p>
    </li>)}</ul></section>}
  </section>;
}

export function WorkflowComparisons({record}:{record:WorkshopRecord}) {
  const comparisons:Comparison[]=buildWorkflowComparisons(record);
  if(!comparisons.length)return <p className="cv-empty">No use cases are recorded yet.</p>;
  return <div className="cv-final-cases">{comparisons.map(comparison=><section className="cv-candidate" key={comparison.candidateId} data-candidate-id={comparison.candidateId}>
    <h3>{comparison.title} <span className="cv-reference">({comparison.candidateId})</span></h3>
    <p className="wfc-case-summary">{record.phases.find(phase=>phase.id===4)?.answers.candidates?.find(candidate=>candidate.id===comparison.candidateId)?.aiWork}</p>
    {comparison.priority && <p className="cv-case-priority">Recorded priority: {comparison.priority}</p>}
    <WorkflowComparison comparison={comparison} />
  </section>)}</div>;
}
