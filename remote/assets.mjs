import method from '../skills/ai-use-case-workshop/SKILL.md';
import contract from '../skills/ai-use-case-workshop/references/host-contract.md';
import phases from '../skills/ai-use-case-workshop/references/phases.md';
import design from '../skills/ai-use-case-workshop/assets/DESIGN.md';
import foundations from '../skills/ai-use-case-workshop/references/foundations.md';
import css from '../skills/ai-use-case-workshop/assets/workbook.css';
import fontBytes from '../skills/ai-use-case-workshop/assets/fonts/DMSerifDisplay-Regular.ttf';
import widget from '../dist/widget.html';

const files = new Map([
  ['skills/ai-use-case-workshop/SKILL.md', method],
  ['skills/ai-use-case-workshop/references/host-contract.md', contract],
  ['skills/ai-use-case-workshop/references/phases.md', phases],
  ['skills/ai-use-case-workshop/assets/DESIGN.md', design],
  ['skills/ai-use-case-workshop/references/foundations.md', foundations],
  ['dist/widget.html', widget],
]);

export async function assetLoader(path) {
  if (!files.has(path)) throw new Error('Unknown workshop asset.');
  return files.get(path);
}

export const workbookAssets = {css, font: Buffer.from(fontBytes).toString('base64')};
