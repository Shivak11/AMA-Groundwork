// The component definitions come from the pinned Prefab build, not from model output.
const MAX_INPUT = 1_000_000;
// Match Python str.strip(), including NEL and the separator control characters.
const hasText = value => Boolean(value.replace(/^[\t-\r\x1c-\x20\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t-\r\x1c-\x20\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, ''));
const labels = {
  kpi: 'How we will measure it', baseline: 'What we know now',
  guardrail: 'What must not get worse', hypothesis: 'What may need to change',
  blockers: 'Information and decision gaps', information: 'What is needed',
  holder: 'Who holds it', barrier: 'What prevents access or agreement',
  unlock: 'What could help', firstGap: 'Our first priority',
  chosenWorkflow: 'The workflow we chose', recentCase: 'The case we replayed',
  tasks: 'What happened', actor: 'Who did it', work: 'What they did',
  friction: 'Where the work slowed or repeated',
  zeroSecond: 'What would remain even if the slow task took no time',
  redesign: 'How the workflow could change', aiWork: 'What AI would do',
  value: 'Expected contribution', humanCheck: 'Human check',
  nonAiAlternative: 'Non-AI alternative', assumption: 'Assumption',
  choices: 'Our shortlist', candidateId: 'Candidate', evidenceGap: 'Missing evidence',
  challenge: "The group's challenge", costs: 'Recurring costs and human effort',
  owner: 'Proposed owner', peopleChange: 'What changes for people',
  stopRule: 'When we would stop or change direction', test: 'The first test',
};

function readableAnswers(answers, candidateTitles) {
  const lines = [];
  const display = value => value === null ? 'None' : String(value);
  function appendFields(value, indent = '') {
    for (const [key, original] of Object.entries(value)) {
      if (key === 'id') continue;
      const expanded = key.replace(/([A-Z])/g, ' $1');
      let label = labels[key] ?? expanded.slice(0, 1).toUpperCase() + expanded.slice(1).toLowerCase();
      let item = original;
      if (key === 'candidateId') item = item === null ? 'No pilot candidate' : candidateTitles.get(item) ?? item;
      if (key === 'taskIds') {
        label = 'Linked workflow steps';
        item = item.length ? item.join(', ') : 'New work; see the stated dependency';
      }
      if (Array.isArray(item)) {
        lines.push(`${indent}${label}:`);
        item.forEach((row, index) => {
          if (row && !Array.isArray(row) && typeof row === 'object') {
            lines.push(`${indent}${index + 1}.`);
            appendFields(row, `${indent}  `);
          } else lines.push(`${indent}• ${display(row)}`);
        });
      } else lines.push(`${indent}${label}: ${display(item)}`);
    }
  }
  appendFields(answers);
  return lines.join('\n\n');
}

function atPath(value, keys) {
  return keys.reduce((current, key) => current[key], value);
}

/** Inject bundled JSON and HTML so the Worker has no filesystem or Python dependency. */
export function createCompiledPrefabAdapter({ templates, rendererHtml }) {
  if (templates?.schemaVersion !== 1 || templates?.prefabVersion !== '0.20.2' || templates?.protocolVersion !== '0.3') {
    throw new Error('Unexpected compiled Prefab version. Rebuild the remote assets.');
  }
  if (typeof rendererHtml !== 'string' || !rendererHtml.includes('<html')) {
    throw new Error('The bundled Prefab renderer is missing.');
  }
  return {
    async buildPrefabView(record) {
      if (new TextEncoder().encode(JSON.stringify(record)).byteLength > MAX_INPUT) {
        throw new Error('The workshop record is too large. Continue in text mode.');
      }
      const phaseMap = new Map(record.phases.map(phase => [phase.id, phase]));
      const candidates = phaseMap.get(4)?.answers.candidates ?? [];
      if (candidates.length < 1 || candidates.length > 5) {
        throw new Error('Complete at least one candidate in phase 4 before opening the shortlist.');
      }
      if ([1, 2, 3, 4].some(id => phaseMap.get(id)?.status !== 'confirmed')) {
        throw new Error('Confirm phases 1–4 before opening the shortlist.');
      }
      const layout = templates.layouts[candidates.length];
      if (!layout) throw new Error('The compiled shortlist layout is missing. Continue in text mode.');
      const envelope = structuredClone(layout.envelope);
      const answers = phaseMap.get(5).answers;
      const choices = new Map((answers.choices ?? []).map(choice => [choice.candidateId, choice]));
      const state = {
        groupName: record.group.name, revision: record.revision,
        problem: record.group.problem ?? '',
        outcome: phaseMap.get(1).answers.outcome ?? '', kpi: phaseMap.get(1).answers.kpi ?? '',
        source: structuredClone(candidates), ...structuredClone(templates.initialState),
        challenge: answers.challenge ?? '', costs: answers.costs ?? '',
      };
      let complete = hasText(answers.challenge ?? '') && hasText(answers.costs ?? '');
      candidates.forEach((candidate, index) => {
        const choice = choices.get(candidate.id) ?? {};
        Object.assign(state, {
          [`decision${index}`]: choice.decision ?? '', [`reason${index}`]: choice.reason ?? '',
          [`gap${index}`]: choice.evidenceGap ?? '', [`assumption${index}`]: candidate.assumption ?? '',
        });
        complete = complete && ['decision', 'reason', 'evidenceGap'].every(key => hasText(choice[key] ?? ''));
      });
      if (complete && phaseMap.get(5).status !== 'confirmed') {
        atPath(envelope, layout.reviewChildrenPath).push(structuredClone(templates.confirmationButton));
      }
      const chapterChildren = atPath(envelope, layout.chapterChildrenPath);
      const candidateTitles = new Map(candidates.map(candidate => [candidate.id, candidate.title]));
      for (const phase of record.phases) {
        if (!['confirmed', 'needs_review'].includes(phase.status)) continue;
        const components = templates.chapters[phase.id]?.[phase.status];
        if (!components) throw new Error('A compiled workbook chapter is missing. Continue in text mode.');
        chapterChildren.push(...structuredClone(components));
        state[`chapter${phase.id}`] = readableAnswers(phase.answers, candidateTitles);
      }
      envelope.state = state;
      return envelope;
    },
    async loadPrefabRenderer() { return rendererHtml; },
  };
}
