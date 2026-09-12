// All people, observations and decisions below are fictional test data.
export const group = {name:'Service Improvement Group',members:['Asha','Kabir','Leena'],problem:'Equipment requests are repeatedly returned for missing information.',context:'Fictional classroom example — internal shared services',date:'2026-09-08'};
export const answers = [
  {outcome:'Reduce repeated requests for missing information so employees can start work with the equipment they need.',kpi:'Share of equipment requests returned for missing information.',baseline:'Unknown. The group has anecdotes but no measured baseline.',guardrail:'Keep budget approval with the authorised manager and avoid exposing employee personal information.',hypothesis:'Detect incomplete requests before they reach the approver, while separating missing information from approval delays.'},
  {blockers:[{information:'Equipment, intended start date and delivery location',holder:'Requesting team',barrier:'Some requests omit the start date; people use different email formats.',unlock:'Agree the minimum information and test a mandatory form.'},{information:'Who can approve an exception',holder:'Budget owner',barrier:'Authority is unclear when the usual approver is absent.',unlock:'Name a substitute approver and publish a bounded exception route.'}],firstGap:'Agree the minimum request information before choosing a technical solution.'},
  {workflows:['Equipment request intake','Budget approval','Equipment allocation'],chosenWorkflow:'Equipment request intake',recentCase:'In this fictional case, an incomplete email went to IT, returned to the requester, and then waited for a budget decision.',tasks:[{id:'t1',actor:'Requesting team',work:'Email a request for equipment.',friction:'The intended start date is absent.'},{id:'t2',actor:'IT coordinator',work:'Check the email and request the missing information.',friction:'Repeated reading and a return message.'},{id:'t3',actor:'Requesting team',work:'Supply the start date and resend.',friction:'The coordinator has to connect two messages.'},{id:'t4',actor:'Budget owner',work:'Approve or reject the request.',friction:'The absent approver has no agreed substitute.'}],zeroSecond:'Even instant completeness checking would leave the wait for budget authority.',redesign:'Use a single intake record and a named substitute approver; retain a person for exceptions.'},
  {candidates:[
    {id:'c1',title:'Check request completeness',taskIds:['t1','t2'],aiWork:'Suggest which agreed information is missing from a free-text request.',value:'May reduce returned requests, if a mandatory form cannot address the common omissions.',humanCheck:'The coordinator verifies the suggested omission against the agreed minimum fields.',nonAiAlternative:'Use mandatory fields in a simple request form.',assumption:'Unknown whether enough free-text requests remain to justify AI.'},
    {id:'c2',title:'Assemble the approval brief',taskIds:['t3','t4'],aiWork:'Draft a short brief from the request and its follow-up messages, with source references.',value:'Could reduce the time spent reconstructing a request before a decision.',humanCheck:'The coordinator checks the source references; only the authorised budget owner approves.',nonAiAlternative:'Keep all request changes in one structured record.',assumption:'The approved test data contains the complete message chain and can be shared safely.'},
    {id:'c3',title:'Find recurring reasons for rework',taskIds:['t1','t2','t3'],aiWork:'Propose categories for returned requests in a de-identified sample.',value:'Could reveal changes to the form or guidance that prevent rework.',humanCheck:'A coordinator checks every category in the small test sample.',nonAiAlternative:'Manually code a small sample using a spreadsheet.',assumption:'The sample can be de-identified without losing the reason for each return.'}]},
  {choices:[{candidateId:'c1',decision:'Later',reason:'Test the mandatory form first; AI may add no value for fixed fields.',evidenceGap:'Frequency and nature of omissions after the form change.'},{candidateId:'c2',decision:'Later',reason:'It cannot resolve missing approval authority, which currently limits the outcome.',evidenceGap:'Time spent reconstructing requests and permission to use the messages.'},{candidateId:'c3',decision:'First',reason:'A small checked sample can inform the simpler process change without automating an approval.',evidenceGap:'Whether the categories are useful enough to change the form or guidance.'}],challenge:'Leena challenged whether manual categorisation would be faster. The test will compare both approaches rather than assume AI is better.',costs:'Token and software costs are unknown. Include de-identification, checking, exception handling and maintaining the categories. No cash saving is claimed.'},
  {decision:'Test a use case',candidateId:'c3',owner:'Proposed owner: shared-services lead, subject to their agreement.',evidence:'This fictional group has a case account, not a measured baseline. It must collect a small permitted sample.',peopleChange:'The coordinator checks proposed categories and remains responsible for any changes to request guidance.',test:'With permission, compare manual and AI-assisted categorisation on 20 de-identified returned requests. Record preparation and checking effort as well as useful changes proposed.',stopRule:'Stop if private information cannot be removed, checking takes more effort than manual coding, or categories do not lead to a useful change.',recommendation:'Run the small comparison before deciding whether to use AI. Introduce clearer request fields and substitute approval authority independently of the AI test.'},
];

answers[2].underlyingProblem='Requests arrive in inconsistent formats without the agreed minimum information, and budget decisions have no agreed substitute approver. Completeness checking can address the missing fields but cannot create approval authority.';
const groundedServiceDetails={
  c1:{
    inputs:'A permitted free-text equipment request and the agreed list of minimum fields.',
    output:'A short list of missing or unclear required details for the coordinator to verify.',
    trigger:'The coordinator receives a free-text request that cannot use the mandatory form.',
    knowledge:'The agreed request fields and the guidance for exceptions. A fixed supplied checklist is sufficient initially.',
    format:'Check each required field and identify its supporting text. Do not infer a delivery date or approval.',
    access:'Only the requesting team and authorised coordinator may access the request. Remove unnecessary personal information.',
    implementation:{
      approach:'Test a mandatory form first. If permitted free-text requests remain necessary, give the request and field checklist to a reusable checking instruction.',
      components:[{kind:'Skill',purpose:'Apply the same minimum-field check to each request.',basis:'Free-text requests need to be compared with a fixed list of required details.',status:'Proposed'},{kind:'Human review',purpose:'Have the coordinator verify missing information before returning the request.',basis:'A suggestion of missing information may be wrong and does not grant budget approval.',status:'Proposed'}],
      checks:'Measure omissions after the form change and compare any remaining AI check with the coordinator’s manual check. Confirm permitted request data and do not assume that AI removes the approval wait.',
    },
    workflow:[{actor:'Person',action:'Submit a free-text request when the standard form cannot be used.'},{actor:'AI',action:'Compare the request with the required fields.'},{actor:'Person',action:'Verify any missing or unclear information.'},{actor:'Person',action:'Supply the missing details in the shared request record.'}],
  },
  c2:{
    inputs:'The permitted equipment request and its complete follow-up messages, with their source references.',
    output:'A source-linked brief showing requested equipment, timing, location, changes and any missing information.',
    trigger:'The coordinator asks for a brief after the requester supplies the required information.',
    knowledge:'The agreed approval-brief template and the supplied request history. No wider document search is required initially.',
    format:'Follow the same brief headings, cite each source and retain unknowns without inferring approval.',
    access:'The authorised coordinator and budget owner may view the request. The system must not share it with a wider audience.',
    implementation:{
      approach:'Begin with permitted uploaded messages and a reusable brief format. A single structured request record may remove the need for AI assembly.',
      components:[{kind:'Skill',purpose:'Draft a consistent brief that retains source references and unknowns.',basis:'The coordinator wants to assemble scattered follow-up messages in one format.',status:'Proposed'},{kind:'Human review',purpose:'Verify the brief before the budget owner makes the approval decision.',basis:'Only the authorised budget owner can approve the request.',status:'Proposed'},{kind:'Connector',purpose:'Read the complete permitted message chain if an authorised integration is available.',basis:'Messages may already be in an existing service workspace, but its identity and access have not been confirmed.',status:'Needs confirmation'}],
      checks:'Compare source accuracy and checking effort with a single structured request record. Confirm access to the complete message chain and the actual budget authority before using live requests.',
    },
    workflow:[{actor:'Person',action:'Provide the permitted request and complete follow-up messages.'},{actor:'AI',action:'Draft the approval brief with source references.'},{actor:'Person',action:'Verify the brief and resolve missing information.'},{actor:'Person',action:'Approve or reject the request using the agreed authority.'}],
  },
  c3:{
    inputs:'A small permitted, de-identified sample of returned equipment requests and the recorded reason for each return.',
    output:'Suggested rework categories linked to sample entries and a list of possible changes to the request form.',
    trigger:'The shared-services lead asks for a review of a bounded sample.',
    knowledge:'The current form fields and any existing reason categories supplied with the sample.',
    format:'Show the evidence for every category, retain unclassified cases and do not infer employee performance.',
    access:'An authorised coordinator prepares the sample and checks that personal information is removed before processing.',
    implementation:{
      approach:'Use a de-identified uploaded sample with reusable categorisation instructions. Compare it with manual spreadsheet coding; no connector, document retrieval or autonomous agent is needed for this bounded review.',
      components:[{kind:'Skill',purpose:'Apply consistent reason categories and link every classification to its source entry.',basis:'The group needs comparable categories across a small returned-request sample.',status:'Proposed'},{kind:'Human review',purpose:'Check all proposed categories and decide whether to change the form or guidance.',basis:'The coordinator remains accountable for interpreting the sample and process changes.',status:'Proposed'}],
      checks:'Verify de-identification, classification accuracy, unclassified cases and total preparation and review effort against manual coding. Confirm that any suggested form change follows from recorded examples.',
    },
    workflow:[{actor:'Person',action:'Prepare and de-identify the permitted sample.'},{actor:'AI',action:'Propose rework categories with evidence for each entry.'},{actor:'Person',action:'Check and correct every category in the sample.'},{actor:'Person',action:'Decide which request-form or guidance changes are justified.'}],
  },
};
for(const candidate of answers[3].candidates)Object.assign(candidate,groundedServiceDetails[candidate.id]);
