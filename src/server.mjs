import { readFile } from 'node:fs/promises';
import { renderWorkbookPdf, renderWorkbookHtml } from './render-workbook.mjs';
import { createWorkshopServer as createCoreServer } from './server-core.mjs';

const root = new URL('../', import.meta.url);
const assetLoader = path => readFile(new URL(path, root), 'utf8');

export async function createWorkshopServer(options = {}) {
  return createCoreServer({pdfRenderer: renderWorkbookPdf, bookRenderer:renderWorkbookHtml, assetLoader, ...options});
}
