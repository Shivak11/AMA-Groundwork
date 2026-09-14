import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {renderWorkbookHtml,renderWorkbookPdf} from '../src/render-workbook.mjs';
import {group,answers} from '../examples/hiring.mjs';
const limit=Number(process.argv[2]??6);
await mkdir(new URL('../output/visual-review/checkpoints/',import.meta.url),{recursive:true});
let record=createRecord(group);
for(let phase=1;phase<=limit;phase++) {
  record=confirmPhase(savePhase(record,phase,answers[phase-1]),phase,'The fictional group approves the displayed summary.');
  const pdf=await renderWorkbookPdf(record);
  assert(pdf.subarray(0,5).toString()==='%PDF-');
  const base=new URL(`../output/visual-review/checkpoints/phase-${phase}`,import.meta.url);
  const basePath=fileURLToPath(base);
  await writeFile(`${basePath}.html`,renderWorkbookHtml(record));
  await writeFile(`${basePath}.pdf`,pdf);
  await writeFile(`${basePath}.json`,JSON.stringify(record,null,2));
  console.log(`Step ${phase}: ${pdf.length} PDF bytes, revision ${record.revision}`);
}
