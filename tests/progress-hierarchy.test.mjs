import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildSync, transformSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRecord, savePhase, confirmPhase} from '../src/workshop.mjs';
import {group, answers} from '../examples/hiring.mjs';

// Exercise the actual TSX as a React render without a browser, host or network.
const compiled = buildSync({
  entryPoints:[new URL('../src/inline-view.tsx', import.meta.url).pathname],
  bundle:true, platform:'node', format:'cjs', jsx:'automatic', write:false,
  external:['react', 'react/jsx-runtime'],
}).outputFiles[0].text;
const loaded = {exports:{}};
new Function('require', 'module', 'exports', compiled)(createRequire(import.meta.url), loaded, loaded.exports);
const {InlineWorkshop} = loaded.exports;
const css = readFileSync(new URL('../src/inline-view.css', import.meta.url), 'utf8');

function completed(through = 0) {
  let record = createRecord(group);
  for (let id = 1; id <= through; id++) record = confirmPhase(savePhase(record, id, answers[id - 1]), id, 'Our group approves the saved wording.');
  return record;
}
function render(record, phaseId) {
  return renderToStaticMarkup(createElement(InlineWorkshop, {
    record, phaseId, connected:true, busy:false, hasPdf:false, exportFailed:false,
    notice:'', noticeError:false, onDownload:async()=>{}, onRequestFiles:async()=>{},
  }));
}
const header = html => html.match(/<header class="cw-header">(.*?)<\/header>/s)?.[1] ?? '';
const stateText = html => header(html).match(/<p class="cw-step-state[^\"]*">(.*?)<\/p>/s)?.[1] ?? '';
function progressItem(html, id) {
  return html.match(new RegExp(`<li[^>]*data-step="${id}"[^>]*>.*?<\\/li>`, 's'))?.[0] ?? '';
}

test('the viewed step leads once, with state immediately below and group identity secondary', () => {
  const record = savePhase(completed(), 1, {outcome:answers[0].outcome});
  const html = render(record, 1), top = header(html);
  assert.match(top, /^<h1 id="snapshot-phase-title">Step 1: Goal and success measure<\/h1><p class="cw-step-state/);
  assert.equal(stateText(html), 'Step 1 is in progress. Continue in the conversation.');
  assert.match(top, /class="cw-group-identity"/);
  assert(!top.includes(record.group.problem));
  assert.equal((html.match(/id="snapshot-phase-title"/g) ?? []).length, 1);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert(!html.includes('<h2 id="snapshot-phase-title"'));
  assert(html.includes(record.group.problem), 'The complete problem remains available in group details.');
  assert(html.includes(answers[0].outcome), 'The saved participant wording remains available.');
});

test('an approved viewed chapter is separate from the current conversational step', () => {
  const html = render(completed(2), 1);
  assert.equal(stateText(html), 'Step 1 is approved; Step 3 is next in this saved view.');
  assert.match(progressItem(html, 1), /data-state="approved" data-viewed="true"/);
  assert.match(progressItem(html, 1), /Shown below/);
  assert(!progressItem(html, 1).includes('aria-current'));
  assert.match(progressItem(html, 3), /data-state="active" data-viewed="false" aria-current="step"/);
  assert.match(progressItem(html, 3), /In progress · Current step/);
  assert.match(progressItem(html, 4), /data-state="future"/);
  assert.match(progressItem(html, 4), /Not started/);
  assert.match(html, /Later conversation changes may not appear in this card/);
});

test('needs-review states keep the next review separate from the chapter being read', () => {
  const record = savePhase(completed(4), 2, {firstGap:'Recheck the approval authority with the group.'});
  const html = render(record, 4);
  assert.equal(stateText(html), 'Step 4 needs review because an earlier answer changed. Step 2 is next in this saved view.');
  assert.match(progressItem(html, 4), /data-state="review" data-viewed="true"/);
  assert.match(progressItem(html, 4), /Needs review/);
  assert(!progressItem(html, 4).includes('aria-current'));
  assert.match(progressItem(html, 2), /aria-current="step"/);
});

test('all-approved and not-yet-started views do not invent ongoing or completed work', () => {
  const done = render(completed(6), 6);
  assert.equal(stateText(done), 'All six steps are approved. You can request the complete workbook below.');
  assert(!done.includes('aria-current="step"'));
  const future = render(completed(1), 5);
  assert.equal(stateText(future), 'Step 5 has no saved answers yet. Continue with Step 2 in the conversation.');
  assert.match(progressItem(future, 5), /data-state="future" data-viewed="true"/);
  assert.match(progressItem(future, 5), /Not started/);
  assert(!future.match(/<(?:input|textarea|select|form)\b/));
  assert.match(future, /Download PDF/);
  assert.match(future, /Request current file links/);
});

test('empty current steps and review continuations use concise, specific status copy', () => {
  assert.equal(stateText(render(completed(), 1)), 'Step 1 has no saved answers yet. Continue in the conversation.');
  const changed = savePhase(completed(4), 2, {firstGap:'Review the source of the decision gap.'});
  const record = confirmPhase(changed, 2, 'Our group approves the corrected saved wording.');
  assert.equal(stateText(render(record, 3)), 'Step 3 needs review because an earlier answer changed.');
  assert.equal(stateText(render(record, 4)), 'Step 4 needs review because an earlier answer changed. Step 3 is next for review in this saved view.');
});

test('theme fallbacks cannot override an explicit host light or dark preference', () => {
  assert.doesNotThrow(() => transformSync(css, {loader:'css'}));
  const osRule = css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(osRule, /:root:not\(\[data-theme="light"\]\):not\(\[data-theme="dark"\]\):not\(\.light\) \.inline-workbook/);
  const explicit = css.slice(css.indexOf(':root.dark:not([data-theme="light"])'));
  assert.match(explicit, /:root\[data-theme="dark"\] \.inline-workbook/);
  assert.match(explicit, /:root:not\(\[data-theme="light"\]\) \.inline-workbook\.dark/);
  assert.match(explicit, /--cw-surface-fallback: #282a26/);
  assert.match(css, /--cw-surface: var\(--color-background-primary, var\(--cw-surface-fallback\)\)/);
  for (const token of ['success', 'info', 'warning']) {
    assert(css.includes(`--color-text-${token}`));
    assert(css.includes(`--color-background-${token}`));
  }
  assert(!/\.dark \.inline-workbook\s*[,\{]/.test(css), 'An unqualified dark class must not override data-theme=light.');
});

test('semantic fallback text remains readable on its light and dark status surface', () => {
  function luminance(hex) {
    const channels = hex.match(/\w\w/g).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
  }
  for (const [text, background] of [['43664d','eef5ee'], ['275f81','edf5fa'], ['7c571f','fff5df'], ['a8cdb0','223329'], ['afcfe8','1f303b'], ['dfc18d','393021']]) {
    const values = [luminance(text), luminance(background)].sort((a,b) => b-a);
    assert((values[0]+.05)/(values[1]+.05) >= 4.5, `${text} on ${background}`);
    assert(css.includes(`#${text}`) && css.includes(`#${background}`));
  }
});
