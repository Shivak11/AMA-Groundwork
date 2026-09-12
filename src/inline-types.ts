export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6;
export type Blocker = {information: string; holder: string; barrier: string; unlock: string};
export type Task = {id: string; actor: string; work: string; friction: string};
export type Candidate = {id: string; title: string; taskIds: string[]; aiWork: string; value: string; humanCheck: string; nonAiAlternative: string; assumption: string;
  inputs?:string; output?:string; trigger?:string; knowledge?:string; format?:string; access?:string;
  workflow?:{actor:'Person'|'AI'|'System';action:string}[];
  implementation?:{approach:string;components:{kind:'Skill'|'Connector'|'RAG'|'Workflow'|'Agent'|'Human review'|'Other';purpose:string;basis:string;status:'Proposed'|'Needs confirmation'}[];checks:string};
};
export type Priority = 'First' | 'Later' | 'Do not pursue';
export type Choice = {candidateId: string; decision: Priority; reason: string; evidenceGap: string};
export type WorkflowComparison = {candidateId:string;stages:{taskIds:string[];proposedStepIndices:number[]}[]};
export type Answers = {
  outcome?: string; kpi?: string; baseline?: string; guardrail?: string; hypothesis?: string;
  blockers?: Blocker[]; firstGap?: string; workflows?: string[]; chosenWorkflow?: string; recentCase?: string; tasks?: Task[]; zeroSecond?: string; redesign?: string; underlyingProblem?:string;
  candidates?: Candidate[]; choices?: Choice[]; challenge?: string; costs?: string;
  decision?: 'Test a use case' | 'Do not pilot yet'; candidateId?: string | null; owner?: string; evidence?: string; peopleChange?: string; test?: string; stopRule?: string; recommendation?: string;
  workflowComparisons?:WorkflowComparison[];
};
export type Phase = {id: PhaseId; status: 'draft' | 'confirmed' | 'needs_review'; answers: Answers};
export type WorkshopRecord = {
  experienceVersion?:2;
  revision: number; group: {name: string; members: string[]; problem: string; context: string; date: string}; phases: Phase[];
  interaction?: {barrierCategories?: Record<string,string>; zeroTaskId?: string; candidateDispositions?: Record<string,'Keep'|'Reconsider'>; priorities?: Record<string,Priority>; undo?: {phaseId: PhaseId; label: string}};
};
export type Presentation = {phaseId: PhaseId; field: keyof Answers; question: string; hint?: string; choices: {label: string; value: string | null}[]};
export type Action = {kind: string; phaseId: PhaseId; expectedRevision: number; field?: string; value?: unknown; index?: number; category?: string; taskIds?: string[]; taskId?: string; candidateId?: string; disposition?: 'Keep'|'Reconsider'; priority?: Priority};
export type InlineProps = {
  isHistorical?:boolean;
  record: WorkshopRecord | null; phaseId: PhaseId;
  bookHtml?: string; hasPdf: boolean; exportFailed: boolean;
  notice: string; noticeError: boolean; busy: boolean; connected: boolean;
  onDownload: (kind: 'pdf' | 'checkpoint') => Promise<void>;
  onRequestFiles: () => Promise<void>;
  workspaceUrl?: string; continuation?: {key:string;revision:number}; latestRevision?: number;
  onOpenWorkspace?: () => Promise<void>;
};
