import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const result = await build({
  entryPoints: ['main.tsx'], bundle: true, minify: true,
  write: false, format: 'iife', target: 'es2022',
  define: {'process.env.NODE_ENV': '"production"'},
});
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const css = await readFile('style.css', 'utf8');
const html = (await readFile('index.html', 'utf8'))
  .replace('/* INLINE_CSS */', () => css)
  .replace('/* INLINE_JS */', () => script);
await mkdir('dist', {recursive: true});
await writeFile('dist/index.html', html);
console.log(`Self-contained concept: ${Buffer.byteLength(html)} bytes`);
