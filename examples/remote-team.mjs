// Only the group identity and problem come from Shiva's supplied example.
// Every case detail, task, proposed intervention and decision below is fictional test data.
// No employee account, actual team message or performance evidence is represented here.
export const group = {
  name:'1A',
  members:['Shiva','Chirag'],
  problem:'When the manager is away, useful team updates require repeated follow-ups. Replies such as okay do not explain progress or blockers. We want AI to collect substantive updates and give the manager a condensed account without micromanagement.',
  context:'Fictional classroom test. Only the group and problem were supplied; the case, tasks and proposed decisions are assumptions for testing, not facts about a real team.',
  date:'2026-09-11',
};

export const answers = [
  {
    outcome:'Give the absent manager a useful account of progress, blockers and needed decisions at one agreed checkpoint, without repeated follow-ups or micromanagement.',
    kpi:'Share of agreed checkpoint updates that explain progress, the next step and any blocker without more than one clarification.',
    baseline:'Unknown',
    guardrail:'Use one agreed checkpoint and at most one clarification. Employees can correct a source-linked brief. Do not rank employees, monitor them covertly or escalate automatically.',
    hypothesis:'Fictional, untested proposal: an agreed update structure and a bounded clarification may make updates more useful. A simple form may be sufficient without AI.',
  },
  {
    blockers:[
      {information:'The Finance figure needed to finish a weekly client report.',holder:'The Finance contact in the fictional case.',barrier:'The figure has not arrived. The cause and the contact’s capacity are unknown.',unlock:'The manager checks the dependency with the authorised Finance contact and agrees what to do if the figure remains unavailable.'},
      {information:'What is complete, what happens next and which decision the manager needs to make.',holder:'The team member doing the fictional report.',barrier:'The reply says okay and does not contain those details. The reason for the brief reply is unknown.',unlock:'Agree a short update format and one checkpoint with the team, then allow the employee to correct the account.'},
    ],
    firstGap:'Agree what a useful update contains and when it is needed before choosing an AI tool. Separately check the missing Finance input.',
  },
  {
    workflows:['Collect and act on a remote-team checkpoint update','Resolve a missing Finance input'],
    chosenWorkflow:'Collect and act on a remote-team checkpoint update',
    recentCase:'Fictional case for this exercise: a weekly client report waits for a Finance figure. The absent manager asks for status, receives okay, asks for detail and reconstructs what is blocked before deciding whether to resolve the dependency, replan or take no action.',
    underlyingProblem:'The manager and team have not agreed what a useful checkpoint update must contain. Short replies leave progress, blockers and requested decisions unclear. The missing Finance figure is a separate dependency that better messaging cannot resolve.',
    tasks:[
      {id:'t1',actor:'Manager',work:'Ask for the status of the weekly client report.',friction:'The request may start another follow-up instead of using an agreed checkpoint.'},
      {id:'t2',actor:'Team member',work:'Gather what is complete, what remains and which Finance figure is missing.',friction:'The missing figure cannot be supplied by writing a faster status message.'},
      {id:'t3',actor:'Team member',work:'Reply to the manager with an update.',friction:'In this fictional case the reply says okay and leaves progress and the blocker unexplained.'},
      {id:'t4',actor:'Manager and team member',work:'Clarify the reply and reconstruct progress, the next step and the dependency.',friction:'Repeated questions cost attention and can feel like micromanagement.'},
      {id:'t5',actor:'Manager',work:'Decide whether to resolve the Finance dependency, replan the report or take no action.',friction:'A condensed update can inform the decision but does not give AI authority over people or Finance.'},
    ],
    zeroSecond:'Even if every follow-up and condensed update took zero seconds, the missing Finance figure and the manager’s dependency decision would remain. Faster messaging alone would not finish the client report.',
    redesign:'Agree one checkpoint and a short update structure. Permit at most one clarification, show the employee the source-linked brief for correction, and leave dependency decisions and any escalation with the manager.',
  },
  {
    candidates:[
      {id:'c1',title:'Clarify an agreed checkpoint update',taskIds:['t1','t3','t4'],aiWork:'Check an employee-submitted checkpoint update against the agreed fields and propose at most one clarification for missing progress, next step or blocker.',value:'May reduce repeated follow-ups while improving the update’s usefulness; this has not been measured.',humanCheck:'The employee corrects the update and chooses what to submit. The manager checks the account before acting. AI cannot rank people or send an automatic escalation.',nonAiAlternative:'Use a short structured form with the same fields and one agreed checkpoint.',assumption:'The team agrees to the checkpoint, use of its submitted updates and the one-clarification limit. The cause of brief replies remains unknown.'},
      {id:'c2',title:'Prepare a source-linked manager brief',taskIds:['t3','t4','t5'],aiWork:'Condense the employee-submitted updates into progress, blockers and requested decisions, linking each statement to its source and marking missing information.',value:'May reduce the manager’s reconstruction effort without claiming that a dependency has been resolved.',humanCheck:'Employees can correct their account. The manager checks source links and retains every decision about dependencies, priorities and escalation.',nonAiAlternative:'Read the structured checkpoint form or use a shared update table.',assumption:'Permitted source updates are available and checking the brief takes less effort than reading the short form directly.'},
    ],
  },
  {
    choices:[
      {candidateId:'c1',decision:'First',reason:'A fictional comparison with the same structured form can test whether one clarification improves usefulness without adding repeated follow-ups.',evidenceGap:'Baseline update usefulness, the team’s agreement, the need for AI beyond a form and the checking effort are unknown.'},
      {candidateId:'c2',decision:'Later',reason:'First establish whether the submitted updates contain useful facts. A brief cannot repair an unknown or missing Finance figure.',evidenceGap:'The manager’s reconstruction effort, source-link accuracy and benefit beyond reading the structured form are unknown.'},
    ],
    challenge:'In the fictional discussion, Chirag challenges whether a simple agreed form would solve the problem. Compare that form with the AI clarification before deciding whether AI adds value.',
    costs:'Software and token costs are unknown. Include time to agree the update fields, employee corrections, manager checking and ongoing maintenance. No cash saving or employee performance conclusion is claimed.',
  },
  {
    decision:'Test a use case',candidateId:'c1',
    owner:'Proposed owner for this fictional test: the team lead, subject to the team lead’s and participating members’ agreement.',
    evidence:'The supplied problem describes repeated follow-ups, but there is no measured baseline or verified cause. Use a permitted fictional update sample and record usefulness, clarification count and checking effort.',
    peopleChange:'Team members agree the checkpoint and may correct their submitted account. The manager retains dependency, priority and escalation decisions. No employee ranking, covert monitoring or automatic escalation is allowed.',
    test:'First compare the agreed form with an AI-assisted version using the same fictional weekly-report updates. Allow at most one clarification and have people check every summary against its sources. Any later real-team test needs separate agreement and permission.',
    stopRule:'Stop or revise if AI invents a fact, omits a blocker, asks more than one clarification, prevents employee correction or introduces ranking, covert monitoring or automatic escalation. Do not proceed if the form is sufficient.',
    recommendation:'Run the fictional comparison before considering an agreed real-team test. Keep the simple checkpoint form if AI adds no useful improvement. Resolve the Finance dependency through the manager regardless of the messaging tool.',
  },
];

const groundedRemoteDetails = {
  c1:{
    inputs:'An update the employee chooses to submit at the agreed checkpoint. This may include a permitted work link but does not include covertly collected activity.',
    output:'A complete employee-reviewed update covering progress, next step and blockers, or an explicit statement that information remains unavailable.',
    trigger:'The employee submits their update at the single checkpoint agreed with the team.',
    knowledge:'The team’s agreed update fields and boundaries. No company-document search is needed for the initial version.',
    format:'Ask at most one focused clarification for a missing field. Accept unknown or unavailable information and do not send repeated reminders.',
    access:'The employee sees and edits the clarification and their update. Only the agreed manager receives the employee-approved account.',
    implementation:{
      approach:'Begin with a submitted update and a reusable completeness check, followed by employee review. Add automatic access to the agreed update channel only if the team wants it and permissions are confirmed.',
      components:[
        {kind:'Skill',purpose:'Check agreed fields and word one relevant clarification when needed.',basis:'The team wants consistent detail and a strict one-clarification limit.',status:'Proposed'},
        {kind:'Workflow',purpose:'Run the check after submission and return the result to the employee for review.',basis:'The process has an agreed trigger and must not send repeated follow-ups.',status:'Proposed'},
        {kind:'Human review',purpose:'Let the employee edit and approve their update before sharing.',basis:'The team’s autonomy and right to correct the account must be preserved.',status:'Proposed'},
        {kind:'Connector',purpose:'Read updates from the agreed channel if an authorised integration exists.',basis:'The group has not named or authorised a specific update system; uploads remain sufficient for the first version.',status:'Needs confirmation'},
      ],
      checks:'Compare with the same structured form without AI. Check clarification count, useful detail, invented statements and review effort. Confirm team agreement, channel access and retention before using real updates.',
    },
    workflow:[{actor:'Person',action:'Submit an update at the agreed checkpoint.'},{actor:'AI',action:'Check whether progress, next step and blockers are explained.'},{actor:'AI',action:'Ask at most one clarification if a required detail is missing.'},{actor:'Person',action:'Answer, correct or mark the information unavailable.'},{actor:'Person',action:'Approve the update for the manager.'}],
  },
  c2:{
    inputs:'Employee-approved checkpoint updates and any work links the employees are permitted to share.',
    output:'A concise manager brief with progress, blockers and requested decisions, linked back to each approved update.',
    trigger:'The manager requests the brief after the agreed checkpoint; do not infer continuous monitoring.',
    knowledge:'The agreed brief format and the source updates. Broader document retrieval is not required for the initial summary.',
    format:'Use progress, blockers and requested decisions. Retain unknowns, link each statement and do not rank employees.',
    access:'The manager may read only the agreed team’s approved updates. Employees can see and correct the account of their own work.',
    implementation:{
      approach:'Use approved updates as supplied inputs to a reusable summary instruction, then let the manager check source links. Consider a connector only after the actual update system and access are confirmed.',
      components:[
        {kind:'Skill',purpose:'Apply the recurring brief format with source links and explicit unknowns.',basis:'The manager wants the same concise decision-oriented account at each checkpoint.',status:'Proposed'},
        {kind:'Human review',purpose:'Have employees correct their account and the manager verify the brief before acting.',basis:'Decisions about people, priorities and dependencies remain with humans.',status:'Proposed'},
        {kind:'Connector',purpose:'Read approved updates from the agreed workspace without widening access.',basis:'Automatic collection might save preparation, but the source system and available integration are unconfirmed.',status:'Needs confirmation'},
      ],
      checks:'Check the brief against every approved source update. Compare manager reading and verification effort with reading the structured forms directly. Confirm that no source is omitted, invented or shared beyond its permitted audience.',
    },
    workflow:[{actor:'Person',action:'Approve the checkpoint update and permitted work links.'},{actor:'AI',action:'Group progress, blockers and requested decisions with source links.'},{actor:'Person',action:'Review and correct the account of their own work.'},{actor:'Person',action:'Read the brief, check sources and decide what action is needed.'}],
  },
};
for(const candidate of answers[3].candidates) Object.assign(candidate,groundedRemoteDetails[candidate.id]);

// Alternative synthetic endings preserve the same identified cases. They do not
// imply that anyone in a real team has approved a pilot or rejected a colleague.
export const deferredAnswers=structuredClone(answers);
deferredAnswers[4].choices=deferredAnswers[4].choices.map(choice=>({...choice,decision:'Later',reason:'Keep the documented idea, but establish whether the agreed structured form is sufficient first.'}));
deferredAnswers[5]={...deferredAnswers[5],decision:'Do not pilot yet',candidateId:null,recommendation:'Retain both documented use cases for later consideration. Agree the checkpoint and useful update fields first, then measure the remaining need. No AI pilot is proposed now.'};
export const rejectedAnswers=structuredClone(deferredAnswers);
rejectedAnswers[4].choices=rejectedAnswers[4].choices.map(choice=>({...choice,decision:'Do not pursue',reason:'For this fictional decision, the team prefers the agreed structured form and does not have evidence that AI adds enough benefit.'}));
rejectedAnswers[5].recommendation='Document both assessed AI use cases and the reasons for not pursuing them. Use the agreed checkpoint form. Revisit these options only if useful updates still require repeated clarification.';
export const approval='Our fictional group approves this saved summary, including its stated unknowns and human checks.';
