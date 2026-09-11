import {
  bookStepTitles, bookProfileUrl, bookHasLongAnswer, escapeBookText,
  renderBookCover, renderBookVisual,
} from './book-visuals.mjs';

function chapter(record, phase) {
  return `<article class="chapter${bookHasLongAnswer(phase.answers) ? ' long-content' : ''}" id="phase-${phase.id}" aria-labelledby="phase-${phase.id}-title">
    <h2 class="chapter-header" id="phase-${phase.id}-title">Step ${phase.id}. ${escapeBookText(bookStepTitles[phase.id - 1])}</h2>
    ${phase.status === 'needs_review' ? '<p class="review-note">This phase needs your review because an earlier answer changed.</p>' : ''}
    ${renderBookVisual(record, phase.id)}
    <footer class="chapter-footer"><span>Prepared by Dr. Shiva Kakkar</span><a href="${bookProfileUrl}">Click here to access the author’s profile</a></footer>
  </article>`;
}

export function renderWorkbookHtml(record, { css, font }) {
  const chapters = record.phases.filter(phase => phase.status !== 'draft');
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>Our AI Use-Case Portfolio — ${escapeBookText(record.group.name)}</title><style>@font-face{font-family:"DM Serif Display";src:url(data:font/ttf;base64,${font}) format("truetype");font-weight:400;font-style:normal;font-display:block;}\n${css}</style></head><body><main>${renderBookCover(record)}${chapters.map(phase => chapter(record, phase)).join('')}</main></body></html>`;
}
