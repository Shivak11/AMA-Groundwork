import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { renderWorkbookHtml, renderWorkbookPdf } from '../src/render-workbook.mjs';
import { savePhase, confirmPhase } from '../src/workshop.mjs';

const folder = new URL('../output/visual-review/long-answer/', import.meta.url);
await mkdir(folder, { recursive: true });
const source = JSON.parse(await readFile(new URL('../output/visual-review/checkpoints/phase-6.json', import.meta.url), 'utf8'));
const attack = '<script>globalThis.workbookAttack=true</script><img src="https://example.invalid/leak">';
const outcome = 'The group needs a reliable record of the approval before preparing the offer. '.repeat(13) + attack;
assert(outcome.length <= 1200);
let record = savePhase(source, 1, { outcome });
record = confirmPhase(record, 1, 'Our group approves this corrected test summary.');
const html = renderWorkbookHtml(record);
assert(!html.includes(attack));
assert(html.includes('&lt;script&gt;'));
assert(record.phases.slice(1).every(phase => phase.status === 'needs_review'));
await writeFile(new URL('book.html', folder), html);
await writeFile(new URL('book.pdf', folder), await renderWorkbookPdf(record));
const text = execFileSync('pdftotext', ['-layout', fileURLToPath(new URL('book.pdf', folder)), '-'], { encoding: 'utf8' });
assert(text.replace(/\s+/g, ' ').includes(outcome.replace(/\s+/g, ' ')), 'Long hostile answer remains selectable and complete');
assert(text.includes('Needs review'), 'Dependent chapters disclose required review');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
let requests = 0;
try {
  const page = await browser.newPage();
  await page.route('**/*', route => { requests++; return route.abort(); });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.evaluate(() => globalThis.workbookAttack), undefined);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
  }
  assert.equal(requests, 0);
  await writeFile(new URL('evidence.json', folder), JSON.stringify({ pass: true, answerCharacters: outcome.length, externalRequests: requests, widths: [320, 390, 768, 1280], boundary: 'Local browser and PDF test. Does not establish arbitrary maximum-size layout or host behaviour.' }, null, 2));
  console.log('Long-answer PDF, literal hostile text, review states and narrow-width layout passed.');
} finally { await browser.close(); }
