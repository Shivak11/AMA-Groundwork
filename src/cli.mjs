import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateRecord} from './workshop.mjs';
import {renderWorkbookHtml,renderWorkbookPdf} from './render-workbook.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output||!/\.(pdf|html)$/.test(output)) {
  console.error('Usage: node src/cli.mjs checkpoint.json output.pdf (or output.html)');process.exitCode=1;
} else {
  const record=validateRecord(JSON.parse(await readFile(resolve(input),'utf8')));
  if(!record.phases.some(p=>p.status!=='draft')) throw new Error('Confirm the first phase before exporting the portfolio.');
  const artifact=output.endsWith('.pdf')?await renderWorkbookPdf(record):renderWorkbookHtml(record);
  await writeFile(resolve(output),artifact,{flag:'wx'});
  console.log(`Created ${resolve(output)}. Existing files are never overwritten by this command.`);
}
