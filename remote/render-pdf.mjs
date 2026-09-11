import puppeteer from '@cloudflare/puppeteer';
import { Buffer } from 'node:buffer';
import { renderWorkbookHtml } from '../src/workbook-html.mjs';

function bounded(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. Retry the workbook export.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function renderWorkbookPdf(record, options = {}) {
  const { binding, css, font } = options;
  if (!binding) throw new Error('The workbook browser binding is not configured.');
  if (typeof css !== 'string' || !css || typeof font !== 'string' || !font) {
    throw new Error('The workbook design assets are not configured.');
  }
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.min(60_000, Math.max(1_000, options.timeoutMs)) : 25_000;
  const deadline = Date.now() + timeoutMs;
  const run = (promise, label) => bounded(promise, Math.max(1, deadline - Date.now()), label);
  const html = renderWorkbookHtml(record, { css, font });
  let browser;
  let abandonedLaunch = false;
  const launching = puppeteer.launch(binding).then(async launched => {
    if (abandonedLaunch) {
      await bounded(launched.close(), 5_000, 'Browser cleanup');
      throw new Error('Workbook browser launch completed after the export timed out.');
    }
    return launched;
  });
  try {
    browser = await run(launching, 'Workbook browser launch');
    const page = await run(browser.newPage(), 'Workbook page creation');
    page.setDefaultTimeout(Math.max(1, deadline - Date.now()));
    await run(page.setJavaScriptEnabled(false), 'Workbook script restriction');
    await run(page.setRequestInterception(true), 'Workbook network restriction');
    page.on('request', request => {
      if (request.isInterceptResolutionHandled()) return;
      // The font is embedded; no request may leave the browser session.
      const response = request.url().startsWith('data:')
        ? request.continue() : request.abort('blockedbyclient');
      void response.catch(() => {});
    });
    await run(page.setContent(html, {
      waitUntil: 'load', timeout: Math.max(1, deadline - Date.now()),
    }), 'Workbook page loading');
    await run(page.emulateMediaType('print'), 'Workbook print layout');
    await run(page.evaluate(() => document.fonts.ready.then(() => {
      if (!document.fonts.check('20px "DM Serif Display"')) throw new Error('The workbook font did not load.');
    })), 'Workbook font loading');
    const pdf = await run(page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: '<div style="font-family:Arial,sans-serif;font-size:9px;color:#6F5A4E;width:100%;margin:0 16mm;display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid #BCA48E;padding-top:10px"><span>Prepared by Dr. Shiva Kakkar</span><a href="https://www.shivakakkar.com/" style="color:#6F5A4E;text-decoration:underline">Click here to access the author’s profile</a><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
      timeout: Math.max(1, deadline - Date.now()),
    }), 'PDF generation');
    return Buffer.from(pdf);
  } finally {
    abandonedLaunch = true;
    if (browser) await bounded(browser.close(), 5_000, 'Browser cleanup');
  }
}
