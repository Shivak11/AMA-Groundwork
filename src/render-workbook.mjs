import { readFileSync } from 'node:fs';
import { renderWorkbookHtml as renderHtml } from './workbook-html.mjs';

const assets = new URL('../skills/ai-use-case-workshop/assets/', import.meta.url);

export function renderWorkbookHtml(record) {
  const css = readFileSync(new URL('workbook.css', assets), 'utf8');
  const font = readFileSync(new URL('fonts/DMSerifDisplay-Regular.ttf', assets)).toString('base64');
  return renderHtml(record, { css, font });
}

function bounded(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. Retry the workbook export.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function renderWorkbookPdf(record, options = {}) {
  const { chromium } = await import('playwright');
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(60_000, Math.max(1_000, options.timeoutMs)) : 25_000;
  const html = renderWorkbookHtml(record);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      timeout: timeoutMs,
      ...((options.executablePath || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) ? { executablePath:options.executablePath || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
    await context.route('**/*', route => route.abort('blockedbyclient'));
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
    await page.emulateMedia({ media: 'print' });
    await bounded(page.evaluate(() => document.fonts.ready.then(() => {
      if (!document.fonts.check('20px "DM Serif Display"')) throw new Error('The workbook font did not load.');
    })), timeoutMs, 'Workbook font loading');
    return await bounded(page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;font-size:9px;color:#5E6667;width:100%;margin:0 16mm;display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid #CDD2D2;padding-top:10px"><span>Prepared by Dr. Shiva Kakkar</span><a href="https://www.shivakakkar.com/" style="color:#0B6670;text-decoration:underline">Click here to access the author’s profile</a><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    }), timeoutMs, 'PDF generation');
  } finally {
    if (browser) await browser.close();
  }
}
