import { readFile } from 'node:fs/promises';
import { renderWorkbookPdf } from './render-workbook.mjs';
import { createWorkshopServer as createCoreServer } from './server-core.mjs';

const root = new URL('../', import.meta.url);
const assetLoader = path => readFile(new URL(path, root), 'utf8');

export async function createWorkshopServer(options = {}) {
  let prefabAdapter;
  try { prefabAdapter = await import('../prefab/adapter.mjs'); } catch { /* Text remains available. */ }
  return createCoreServer({pdfRenderer: renderWorkbookPdf, assetLoader, prefabAdapter, ...options});
}
