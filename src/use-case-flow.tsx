import type { Candidate } from './inline-types';

export function UseCaseFlow({steps,title='Proposed workflow'}:{steps:Candidate['workflow'];title?:string}) {
  if(!steps?.length)return null;
  return <figure className="cw-use-case-flow" aria-label={title}><figcaption>{title}</figcaption><ol>{steps.map((step,index)=><li key={index} data-actor={step.actor}><div className="cw-flow-node"><span className="cw-flow-number" aria-hidden="true">{index+1}</span><div><strong>{step.actor}</strong><p>{step.action}</p></div></div>{index<steps.length-1&&<svg className="cw-flow-arrow" viewBox="0 0 20 26" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 2v20M4 16l6 6 6-6"/></svg>}</li>)}</ol></figure>;
}
