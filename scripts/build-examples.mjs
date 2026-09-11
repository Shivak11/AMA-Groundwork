import {mkdir,writeFile} from 'node:fs/promises';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {renderWorkbookHtml,renderWorkbookPdf} from '../src/render-workbook.mjs';
import {group,answers} from '../examples/shared-services.mjs';
await mkdir(new URL('../output/',import.meta.url),{recursive:true});
let record=createRecord(group);
for(let i=1;i<=6;i++) {
  record=savePhase(record,i,answers[i-1]);
  record=confirmPhase(record,i,'Fictional test group approval.','2026-09-08T06:30:00.000Z');
  await writeFile(new URL(`../output/phase-${i}.json`,import.meta.url),JSON.stringify(record,null,2));
  await writeFile(new URL(`../output/phase-${i}.html`,import.meta.url),renderWorkbookHtml(record));
  await writeFile(new URL(`../output/phase-${i}.pdf`,import.meta.url),await renderWorkbookPdf(record));
  console.log(`Phase ${i} PDF generated.`);
}
