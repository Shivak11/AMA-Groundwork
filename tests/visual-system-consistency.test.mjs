import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildSync,transformSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRecord,savePhase,confirmPhase} from '../src/workshop.mjs';
import {group,answers} from '../examples/remote-team.mjs';

const shellCss=readFileSync(new URL('../src/inline-view.css',import.meta.url),'utf8');
const visualCss=readFileSync(new URL('../src/compact-visual.css',import.meta.url),'utf8');
const workbookCss=readFileSync(new URL('../skills/ai-use-case-workshop/assets/workbook.css',import.meta.url),'utf8');
const workspaceSource=readFileSync(new URL('../remote/workspace.mjs',import.meta.url),'utf8');
const localPdfSource=readFileSync(new URL('../src/render-workbook.mjs',import.meta.url),'utf8');
const remotePdfSource=readFileSync(new URL('../remote/render-pdf.mjs',import.meta.url),'utf8');
const plugin=JSON.parse(readFileSync(new URL('../.codex-plugin/plugin.json',import.meta.url),'utf8'));
const packageManifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

function load(path) {
  const compiled=buildSync({entryPoints:[new URL(path,import.meta.url).pathname],bundle:true,platform:'node',format:'cjs',jsx:'automatic',write:false,external:['react','react/jsx-runtime'],loader:{'.css':'empty'}}).outputFiles[0].text;
  const module={exports:{}};
  new Function('require','module','exports',compiled)(createRequire(import.meta.url),module,module.exports);
  return module.exports;
}
const {CompactVisual}=load('../src/compact-visual.tsx');
function completed() {
  let record=createRecord(group);
  for(let id=1;id<=6;id++)record=confirmPhase(savePhase(record,id,answers[id-1]),id,'Our group approves the saved wording.');
  return record;
}
const render=(record,phaseId)=>renderToStaticMarkup(createElement(CompactVisual,{record,phaseId}));

test('one shared content palette is separate from host progress and review state',()=>{
  assert.doesNotThrow(()=>transformSync(`${shellCss}\n${visualCss}`,{loader:'css'}));
  for(const declaration of [
    '--cw-content-card-radius: 4px',
    '--cw-content-card-padding: 16px',
    '--cw-content-ai-bg: #1AA7B8',
    '--cw-content-ai-ink: #102D32',
    '--cw-content-human-bg: #F5B335',
    '--cw-content-human-ink: #352409',
    '--cw-content-functional-bg: #173033',
    '--cw-content-success: #236B53',
    '--cw-content-success-bg: #E6F2ED',
  ])assert(shellCss.includes(declaration),declaration);
  assert(!/--wfc-(?:ai|check)/.test(visualCss),'Phase 6 must use the shared content tokens instead of a second palette.');
  const contentRules=visualCss.replace(/\.wfc-review\s*\{[^}]*\}/g,'');
  assert(!/var\(--cw-active(?:-soft)?\)/.test(contentRules),'Workbook content must not reuse the current-step colour.');
  assert(!/box-shadow|text-shadow|(?:linear|radial|conic)-gradient|line-clamp|text-overflow/.test(shellCss+visualCss));
});

test('phase 4 and phase 6 use the same AI, current-work and human-check treatments',()=>{
  const record=completed();
  const phase4=render(record,4),phase6=render(record,6);
  assert.match(phase4,/class="cv-option-card cv-option-ai"/);
  assert.match(phase4,/class="cv-option-card cv-option-current"/);
  assert.match(phase4,/class="cv-human-check"/);
  assert.match(phase4,/data-actor="AI"/);
  assert.match(phase6,/class="wfc-activity wfc-ai" data-actor="AI"/);
  assert.match(phase6,/class="wfc-human-check"/);
  assert.match(phase6,/class="wfc-component-kind"/);
  for(const selector of ['.cv-option-card','.cv-human-check','.cw-flow-node','.wfc-activity','.wfc-human-check','.wfc-output','.wfc-components li']) {
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(shellCss+visualCss,new RegExp(`${escaped}[^\\{]*\\{[^}]*var\\(--cw-content-card-padding\\)[^}]*var\\(--cw-content-card-radius\\)`,'s'),selector);
  }
});

test('semantic fills retain accessible text contrast in light and dark hosts',()=>{
  const luminance=hex=>{
    const [r,g,b]=hex.match(/\w\w/g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
    return .2126*r+.7152*g+.0722*b;
  };
  for(const [ink,fill] of [['102D32','1AA7B8'],['352409','F5B335'],['FFFFFF','173033'],['236B53','E6F2ED']]) {
    const values=[luminance(ink),luminance(fill)].sort((a,b)=>b-a);
    assert((values[0]+.05)/(values[1]+.05)>=4.5,`${ink} on ${fill}`);
  }
});

test('the connector, saved workspace, PDF and plugin expose one visual system',()=>{
  const completeSurface=[shellCss,visualCss,workbookCss,workspaceSource,localPdfSource,remotePdfSource,JSON.stringify(plugin)].join('\n');
  for(const retired of ['#F3E9D8','#F8F0E4','#3A241C','#6F5A4E','#C56A3C','#9B4625','#BCA48E']) {
    assert(!completeSurface.toUpperCase().includes(retired),`Retired colour ${retired} returned.`);
  }
  assert(!/box-shadow|text-shadow|(?:linear|radial|conic)-gradient/i.test(completeSurface));
  for(const declaration of [
    '--current: #F2F5F5','--ink: #173033','--muted: #5D6D6F','--rule: #A7B8BA',
    '--ai: #1AA7B8','--human: #F5B335','--success: #236B53','--success-soft: #E6F2ED',
  ])assert(workbookCss.includes(declaration),declaration);
  for(const value of ['--quiet:#f2f5f5','--ink:#173033','--muted:#5d6d6f','--line:#a7b8ba','--accent:#173033'])assert(workspaceSource.includes(value),value);
  assert.match(workspaceSource,/<button id="pdf" class="primary" type="button">Download PDF<\/button>/);
  for(const renderer of [localPdfSource,remotePdfSource]) {
    for(const value of ['color:#5D6D6F','border-top:1px solid #A7B8BA','color:#173033'])assert(renderer.includes(value),value);
    assert.match(renderer,/printBackground:\s*true/);
  }
  assert.equal(plugin.interface.brandColor,'#173033');
  assert.equal(plugin.version,packageManifest.version);
  assert.equal(existsSync(new URL('../src/widget.css',import.meta.url)),false,'The retired widget stylesheet must not remain available to a later build.');
});
