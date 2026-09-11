const titles = [
  'What should improve?',
  'What prevents progress?',
  'What actually happens?',
  'Where could AI help?',
  'Which should we pursue first?',
  'What do we recommend?',
];
const profileUrl = 'https://www.shivakakkar.com/';

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function answer(value) {
  const text = value === null || value === undefined || value === '' ? 'Not recorded' : value;
  return `<p class="answer">${escape(text)}</p>`;
}

function field(label, value) {
  return `<section class="field"><h3>${escape(label)}</h3>${answer(value)}</section>`;
}

function mainAnswer(label, value) {
  return `<section class="main-answer"><h3>${escape(label)}</h3>${answer(value)}</section>`;
}

function details(entries) {
  return `<dl class="details">${entries.map(([label, value]) => `<dt>${escape(label)}</dt><dd class="answer">${escape(value || 'Not recorded')}</dd>`).join('')}</dl>`;
}

function phaseAnswers(record, id) {
  return record.phases.find(phase => phase.id === id)?.answers ?? {};
}

function candidateTitle(record, id) {
  const candidate = phaseAnswers(record, 4).candidates?.find(item => item.id === id);
  return candidate?.title ?? `Use case ${id || 'not recorded'}`;
}

function renderPhase(record, phase) {
  const a = phase.answers;
  let body = '';
  if (phase.id === 1) {
    body = mainAnswer('The outcome we want', a.outcome)
      + field('How we will measure it', a.kpi)
      + field('What we know about the baseline', a.baseline)
      + `<div class="field-group">${field('What must not get worse', a.guardrail)}${field('What may need to change in how we work', a.hypothesis)}</div>`;
  } else if (phase.id === 2) {
    body = mainAnswer('The first gap to address', a.firstGap)
      + (a.blockers ?? []).map((blocker, index) => `<section class="blocker"><h3>${index + 1}. ${escape(blocker.information)}</h3>${details([
        ['Who holds it', blocker.holder], ['What prevents progress', blocker.barrier], ['What would unlock it', blocker.unlock],
      ])}</section>`).join('');
  } else if (phase.id === 3) {
    body = field('The workflows we considered', '')
      .replace('<p class="answer">Not recorded</p>', `<ul class="simple-list">${(a.workflows ?? []).map(workflow => `<li>${escape(workflow)}</li>`).join('')}</ul>`)
      + field('The workflow we chose', a.chosenWorkflow)
      + mainAnswer('The difficult case we replayed', a.recentCase)
      + `<ol class="timeline">${(a.tasks ?? []).map((task, index) => `<li><span class="step-number" aria-hidden="true">${index + 1}</span><h3>${escape(task.actor)}</h3>${answer(task.work)}<p class="friction answer"><strong>Delay or difficulty: </strong>${escape(task.friction)}</p></li>`).join('')}</ol>`
      + `<div class="field-group">${field('What would remain if the work took zero seconds', a.zeroSecond)}${field('What the workflow may need instead', a.redesign)}</div>`;
  } else if (phase.id === 4) {
    const tasks = phaseAnswers(record, 3).tasks ?? [];
    body = (a.candidates ?? []).map((candidate, index) => {
      const attached = (candidate.taskIds ?? []).map(id => {
        const step = tasks.findIndex(task => task.id === id);
        return step >= 0 ? `step ${step + 1}` : `step ${id} (needs review)`;
      });
      return `<section class="candidate"><h3>${index + 1}. ${escape(candidate.title)}</h3><p class="attached-to">${attached.length ? `Attached to ${escape(attached.join(', '))}.` : 'New work; its dependency is recorded below.'}</p>${field('What AI would do', candidate.aiWork)}${field('How this could improve the outcome', candidate.value)}${field('What a person must check or decide', candidate.humanCheck)}${field('What we could do without AI', candidate.nonAiAlternative)}${field('What we are assuming', candidate.assumption)}</section>`;
    }).join('');
  } else if (phase.id === 5) {
    body = `<table class="comparison"><thead><tr><th scope="col">Use case and decision</th><th scope="col">Our reason</th><th scope="col">Evidence still needed</th></tr></thead><tbody>${(a.choices ?? []).map(choice => `<tr><td data-label="Use case and decision"><p class="row-title answer">${escape(candidateTitle(record, choice.candidateId))}</p><span class="decision">${escape(choice.decision)}</span></td><td class="answer" data-label="Our reason">${escape(choice.reason)}</td><td class="answer" data-label="Evidence still needed">${escape(choice.evidenceGap)}</td></tr>`).join('')}</tbody></table>`
      + field('The strongest challenge to our choice', a.challenge)
      + field('The recurring effort and cost to account for', a.costs);
  } else if (phase.id === 6) {
    body = `<section class="recommendation"><h3>${escape(a.decision)}</h3>${answer(a.recommendation)}</section>`
      + (a.candidateId ? field('The use case we would test', candidateTitle(record, a.candidateId)) : '')
      + field('The proposed accountable owner', a.owner)
      + field('The evidence and permission we need', a.evidence)
      + field('What changes in people’s work', a.peopleChange)
      + `<div class="field-group">${field('The next test or evidence-gathering step', a.test)}${field('When we would stop or revise', a.stopRule)}</div>`;
  }
  return `<article class="chapter" id="phase-${phase.id}" aria-labelledby="phase-${phase.id}-title"><h2 class="chapter-header" id="phase-${phase.id}-title">${phase.id}. ${escape(titles[phase.id - 1])}</h2>${phase.status === 'needs_review' ? '<p class="review-note">This phase needs your review because an earlier answer changed.</p>' : ''}${body}</article>`;
}

export function renderWorkbookHtml(record, { css, font }) {
  const confirmed = record.phases.filter(phase => phase.status === 'confirmed').length;
  const review = record.phases.filter(phase => phase.status === 'needs_review').length;
  const chapters = record.phases.filter(phase => phase.status !== 'draft');
  const progress = review
    ? `${confirmed} of 6 phases confirmed. ${review} ${review === 1 ? 'phase needs' : 'phases need'} review.`
    : `${confirmed} of 6 phases confirmed.`;
  const group = record.group;
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>Our AI Use-Case Portfolio — ${escape(group.name)}</title><style>@font-face{font-family:"DM Serif Display";src:url(data:font/ttf;base64,${font}) format("truetype");font-weight:400;font-style:normal;font-display:block;}\n${css}</style></head><body><main><section class="cover" aria-labelledby="book-title"><h1 id="book-title">Our AI Use-Case Portfolio</h1><p class="group-name answer">${escape(group.name)}</p><p class="members answer">${escape(group.members.join(', '))}</p><section class="problem"><h2>The problem we are working on</h2>${answer(group.problem)}</section>${group.context ? `<p class="context answer">${escape(group.context)}</p>` : ''}<div class="cover-bottom"><p class="progress-copy">${progress}</p><ol class="phase-index">${record.phases.map(phase => `<li class="${phase.status === 'needs_review' ? 'state-review' : ''}"><span class="index-number" aria-hidden="true">${phase.id}</span><span><span class="index-title">${escape(titles[phase.id - 1])}</span><span class="index-state">${phase.status === 'confirmed' ? 'Confirmed' : phase.status === 'needs_review' ? 'Needs review' : 'Not yet confirmed'}</span></span></li>`).join('')}</ol></div><p class="cover-authorship">Prepared by Dr. Shiva Kakkar</p><p class="cover-date">${escape(group.date)}</p></section>${chapters.map(phase => renderPhase(record, phase)).join('')}</main><footer class="book-footer"><span>Prepared by Dr. Shiva Kakkar</span><a href="${profileUrl}">Click here to access the author’s profile</a><span class="footer-page-space" aria-hidden="true"></span></footer></body></html>`;
}
