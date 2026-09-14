import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundled = await build({
  absWorkingDir: root, entryPoints: ['src/widget.mjs'], bundle: true,
  write: false, minify: true, format: 'iife', platform: 'browser', target: ['es2022'],
  legalComments: 'inline',
  loader:{'.css':'text','.ttf':'base64'},
  define: {'process.env.NODE_ENV':'"production"'},
});
const css = (await Promise.all(['inline-view.css','compact-visual.css'].map(name => readFile(path.join(root, 'src', name), 'utf8')))).join('\n');
const font = await readFile(path.join(root, 'skills', 'ai-use-case-workshop', 'assets', 'fonts', 'DMSerifDisplay-Regular.ttf'));
const fontCss = `@font-face{font-family:'DM Serif Display';font-style:normal;font-weight:400;font-display:swap;src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype')}`;
const js = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; frame-src 'self' about:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>AMA-Groundwork</title><style>${fontCss}\n${css.replace(/<\/style/gi, '<\\/style')}</style></head>
<body><main id="workshop-root"></main><noscript>Continue in the conversation and ask for your workbook PDF and JSON checkpoint.</noscript><script>${js}</script></body></html>`;
await mkdir(path.join(root, 'dist'), { recursive: true });
await writeFile(path.join(root, 'dist', 'widget.html'), html);
console.log(`Built self-contained checkpoint view (${Buffer.byteLength(html)} bytes).`);
