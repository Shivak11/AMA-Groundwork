export type PhaseId = 1 | 2 | 3 | 4 | 5 | 6;
export type Blocker = {information: string; holder: string; barrier: string; unlock: string};
export type Task = {id: string; actor: string; work: string; friction: string};
export type Candidate = {id: string; title: string; taskIds: string[]; aiWork: string; value: string; humanCheck: string; nonAiAlternative: string; assumption: string};
export type Priority = 'First' | 'Later' | 'Do not pursue';
export type Choice = {candidateId: string; decision: Priority; reason: string; evidenceGap: string};
export type Answers = {
  outcome?: string; kpi?: string; baseline?: string; guardrail?: string; hypothesis?: string;
  blockers?: Blocker[]; firstGap?: string; workflows?: string[]; chosenWorkflow?: string; recentCase?: string; tasks?: Task[]; zeroSecond?: string; redesign?: string;
  candidates?: Candidate[]; choices?: Choice[]; challenge?: string; costs?: string;
  decision?: 'Test a use case' | 'Do not pilot yet'; candidateId?: string | null; owner?: string; evidence?: string; peopleChange?: string; test?: string; stopRule?: string; recommendation?: string;
};
export type Phase = {id: PhaseId; status: 'draft' | 'confirmed' | 'needs_review'; answers: Answers};
export type WorkshopRecord = {
  revision: number; group: {name: string; members: string[]; problem: string; context: string; date: string}; phases: Phase[];
  interaction?: {barrierCategories?: Record<string,string>; zeroTaskId?: string; candidateDispositions?: Record<string,'Keep'|'Reconsider'>; priorities?: Record<string,Priority>; undo?: {phaseId: PhaseId; label: string}};
};
export type Presentation = {phaseId: PhaseId; field: keyof Answers; question: string; hint?: string; choices: {label: string; value: string | null}[]};
export type Action = {kind: string; phaseId: PhaseId; expectedRevision: number; field?: string; value?: unknown; index?: number; category?: string; taskIds?: string[]; taskId?: string; candidateId?: string; disposition?: 'Keep'|'Reconsider'; priority?: Priority};
export type InlineProps = {
  record: WorkshopRecord | null; phaseId: PhaseId; activePhase: PhaseId; allConfirmed: boolean;
  bookHtml?: string; hasPdf: boolean; exportFailed: boolean; presentation?: Presentation;
  notice: string; noticeError: boolean; busy: boolean; canMutate: boolean; canChat: boolean;
  connected: boolean; contextBlocked: boolean; conflict: null | {kind: string; incoming: WorkshopRecord};
  chatActive: boolean; onResumeUi: () => Promise<void>;
  onAction: (action: Action) => Promise<void>; onAsk: (prompt: string) => Promise<void>;
  onConfirm: (phase: PhaseId) => Promise<void>; onExport: () => Promise<void>; onDownload: (kind: 'pdf' | 'checkpoint') => Promise<void>;
  onPhase: (phase: PhaseId) => void; onRetrySync: () => Promise<void>; onResolve: (incoming: boolean) => Promise<void>;
  onDirty: (dirty: boolean) => void;
};
