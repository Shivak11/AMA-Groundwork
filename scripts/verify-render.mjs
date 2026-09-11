import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {renderWorkbookHtml,renderWorkbookPdf} from '../src/render-workbook.mjs';
import {savePhase,confirmPhase} from '../src/workshop.mjs';
const record=JSON.parse(await readFile(new URL('../output/phase-6.json',import.meta.url),'utf8'));
const attack='<script>globalThis.workbookAttack=true</script><img src="https://example.invalid/leak">';
let long=savePhase(record,1,{outcome:('A long but valid group answer. ').repeat(35)+attack});
long=confirmPhase(long,1,'Approve the test correction');
const html=renderWorkbookHtml(long);
assert(!html.includes(attack));assert(html.includes('&lt;script&gt;'));
await writeFile(new URL('../output/long-review.pdf',import.meta.url),await renderWorkbookPdf(long));
await mkdir(new URL('../previews/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();let requests=0;
  await page.route('http**://**',route=>{requests++;return route.abort();});
  await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>globalThis.workbookAttack),undefined);
  for(const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Horizontal overflow at ${width}`);
  }
  assert.equal(requests,0);
  await page.setViewportSize({width:1280,height:1000});
  await page.setContent(renderWorkbookHtml(record));await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:fileURLToPath(new URL('../previews/book-cover-browser.png',import.meta.url))});
  console.log(JSON.stringify({htmlEscaping:true,externalRequests:requests,mobileWidths:[320,390,768,1280],longReviewPdf:true}));
} finally {await browser.close();}
