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
