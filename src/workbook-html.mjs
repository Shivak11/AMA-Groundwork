import {
  bookStepTitles, bookProfileUrl, bookHasLongAnswer, escapeBookText,
  renderBookCover, renderBookOverview, renderBookVisualParts, renderBookPriorityRows,
} from './book-visuals.mjs';

function chapter(record, phase) {
  const priorities = phase.id === 5;
  const columns = priorities ? 3 : 1;
  const parts = renderBookVisualParts(record, phase.id);
  const row = content => `<tr class="chapter-block"><td colspan="${columns}">${content}</td></tr>`;
  const review = phase.status === 'needs_review' ? '<p class="review-note">This phase needs your review because an earlier answer changed.</p>' : '';
  const title = `Step ${phase.id}. ${escapeBookText(bookStepTitles[phase.id - 1])}`;
  if (phase.id === 6) {
    const blocks = parts.map((content, index) => {
      const comparisonHasItsOwnContext = content.includes('data-book-visual="workflow-comparison"');
      const continuation = index && !comparisonHasItsOwnContext ? `<p class="chapter-continuation-label">${title}</p>` : '';
      return `<section class="chapter-block">${continuation}${content}</section>`;
    }).join('');
    return `<article class="chapter${bookHasLongAnswer(phase.answers) ? ' long-content' : ''}" id="phase-${phase.id}" aria-labelledby="phase-${phase.id}-title">
      <div class="chapter-layout chapter-stack" role="presentation">
        <header class="chapter-title-row"><h2 class="chapter-header" id="phase-${phase.id}-title">${title}</h2>${review}</header>
        ${blocks}
      </div>
      <footer class="chapter-footer"><span>Prepared by Dr. Shiva Kakkar</span><a href="${bookProfileUrl}">Click here to access the author’s profile</a></footer>
    </article>`;
  }
  // Keep priority rows in the chapter table itself. A nested table can move as
  // one unit in older Chromium and leave only its caption on the previous page.
  const body = priorities
    ? `${renderBookPriorityRows(record)}<tbody>${parts.slice(1).map(row).join('')}</tbody>`
    : `<tbody>${parts.map(row).join('')}</tbody>`;
  return `<article class="chapter${bookHasLongAnswer(phase.answers) ? ' long-content' : ''}" id="phase-${phase.id}" aria-labelledby="phase-${phase.id}-title">
    <table class="chapter-layout${priorities ? ' priority-map' : ''}"${priorities ? ' data-book-visual="priority-comparison"' : ' role="presentation"'}>
      ${priorities ? '<colgroup><col style="width:28%"><col style="width:36%"><col style="width:36%"></colgroup>' : ''}
      <thead><tr class="chapter-title-row"><td colspan="${columns}"><h2 class="chapter-header" id="phase-${phase.id}-title">${title}</h2>${review}${priorities ? '<h3 class="priority-caption">The group’s priorities</h3>' : ''}</td></tr>${priorities ? '<tr class="priority-columns"><th scope="col">Use case</th><th scope="col">Our reason</th><th scope="col">Evidence still needed</th></tr>' : ''}</thead>
      ${body}
    </table>
    <footer class="chapter-footer"><span>Prepared by Dr. Shiva Kakkar</span><a href="${bookProfileUrl}">Click here to access the author’s profile</a></footer>
  </article>`;
}

export function renderWorkbookHtml(record, { css, font }) {
  const chapters = record.phases.filter(phase => phase.status !== 'draft');
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>AMA-Groundwork: AI Use-Case Portfolio — ${escapeBookText(record.group.name)}</title><style>@font-face{font-family:"DM Serif Display";src:url(data:font/ttf;base64,${font}) format("truetype");font-weight:400;font-style:normal;font-display:block;}\n${css}</style></head><body><main>${renderBookCover(record)}${renderBookOverview(record)}${chapters.map(phase => chapter(record, phase)).join('')}</main></body></html>`;
}
