import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecord, savePhase, confirmPhase } from '../src/workshop.mjs';
import { renderBookCover, escapeBookText } from '../src/book-visuals.mjs';
import { renderWorkbookHtml } from '../src/render-workbook.mjs';
import { answers } from '../examples/hiring.mjs';

const title = 'Our AI Use-Case Portfolio';
// Synthetic boundary wording, not a transcript or a claim about employees.
const longProblem = 'Fictional remote-team update and review problem. '.repeat(9).slice(0, 400);
const group = { name: 'Group 1A', members: ['Shiva', 'Chirag'], problem: longProblem, context: 'Fictional cover-layout regression.', date: '2026-09-11' };
const heading = html => html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1];

test('the longest allowed problem never becomes the cover title', () => {
  assert.equal(longProblem.length, 400);
  for (const problem of [longProblem, 'Make routine status updates easier to review.', 'X'.repeat(400)]) {
    const cover = renderBookCover(createRecord({ ...group, problem }));
    assert.equal(heading(cover), title);
    assert.ok(cover.includes(`<p class="answer">${escapeBookText(problem)}</p>`));
    assert.ok(cover.includes('class="cover-problem"'));
    assert.ok(!cover.includes('cover-long-title'));
  }
});

test('the full problem has its own labelled body section and is escaped without shortening', () => {
  const problem = '<img src=x onerror=alert(1)> & "proposed" <script>bad()</script>\n' + 'W'.repeat(300);
  const cover = renderBookCover(createRecord({ ...group, problem }));
  assert.equal(heading(cover), title);
  assert.match(cover, /<section class="cover-problem" aria-labelledby="cover-problem-title">/);
  assert.ok(cover.includes(`<h2 id="cover-problem-title">The problem we are examining</h2>`));
  assert.ok(cover.includes(escapeBookText(problem)));
  assert.ok(!cover.includes('<img'));
  assert.ok(!cover.includes('<script>'));
});

test('group, members, authorship and approval state remain on the cover', () => {
  const cover = renderBookCover(createRecord(group));
  for (const text of ['Group 1A', 'Shiva, Chirag', 'Prepared by Dr. Shiva Kakkar', '0 of 6 phases confirmed.', '2026-09-11', 'https://www.shivakakkar.com/']) assert.ok(cover.includes(text));
  assert.ok(cover.includes('The group has not confirmed an outcome yet.'));
  let record = confirmPhase(savePhase(createRecord(group), 1, answers[0]), 1, 'Our group approves this step.');
  record.phases[0].status = 'needs_review';
  const review = renderBookCover(record);
  assert.ok(review.includes(escapeBookText(answers[0].outcome)));
  assert.ok(review.includes('This outcome needs review because an earlier answer changed.'));
  assert.ok(review.includes('1 phase needs review.'));
});

test('local book composition uses the same short cover title and full problem', () => {
  const html = renderWorkbookHtml(createRecord(group));
  assert.equal(heading(html), title);
  assert.ok(html.includes(`<title>${title} — Group 1A</title>`));
  assert.ok(html.includes(escapeBookText(longProblem)));
});

test('cover problem uses readable body typography rather than conditional title sizing', () => {
  const css = readFileSync(new URL('../skills/ai-use-case-workshop/assets/workbook.css', import.meta.url), 'utf8');
  assert.match(css, /\.cover-problem \.answer\s*\{[^}]*font-size:\s*12pt;/);
  assert.match(css, /\.cover-problem h2\s*\{[^}]*font-family:\s*inherit;/);
  assert.ok(!css.includes('cover-long-title'));
});
