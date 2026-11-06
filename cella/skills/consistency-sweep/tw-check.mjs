#!/usr/bin/env node
// Compiles the project's Tailwind CSS for the given classes and prints the rules in cascade order; NONE marks a class
// that emits nothing. Usage, from the repo root: node tw-check.mjs <class> [<class> ...]. See SKILL.md.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { loadTailwindNode, openRepository, repoFiles } from '@cellajs/cli/style';

const repoRoot = path.join(import.meta.dirname, '../../..');
await openRepository(repoRoot);
const candidates = process.argv.slice(2);
if (candidates.length === 0) {
  console.error('usage: node tw-check.mjs <class> [<class> ...]');
  process.exit(2);
}

const entry = repoFiles().find(
  (file) =>
    file.startsWith('frontend/src/') &&
    file.endsWith('.css') &&
    /@import\s+['"]tailwindcss['"]/.test(readFileSync(path.join(repoRoot, file), 'utf8')),
);
if (!entry) throw new Error('no frontend stylesheet imports tailwindcss');
const cssFile = path.join(repoRoot, entry);
const css = readFileSync(cssFile, 'utf8')
  // Source scanning is irrelevant here: candidates are passed explicitly.
  .replace(/@source[^;]*;/g, '');

const { compile } = await loadTailwindNode();
const compiler = await compile(css, { base: path.dirname(cssFile), onDependency: () => {} });
const out = compiler.build(candidates);

// Print the utilities layer (cascade order) and the components layer (focus-effect lives there); drop the theme,
// base and @property boilerplate.
const layerBlock = (name) => {
  const start = out.indexOf(`@layer ${name}`);
  if (start < 0) return '';
  let depth = 0;
  for (let i = out.indexOf('{', start); i < out.length; i++) {
    if (out[i] === '{') depth++;
    else if (out[i] === '}' && --depth === 0) return out.slice(start, i + 1);
  }
  return out.slice(start);
};
const body = [layerBlock('components'), layerBlock('utilities')].filter(Boolean).join('\n');

for (const c of candidates) {
  const escaped = `.${c.replace(/[^a-zA-Z0-9-]/g, (ch) => `\\${ch}`)}`;
  console.log(`${body.includes(escaped) ? 'ok  ' : 'NONE'} ${c}`);
}
console.log('\n--- compiled CSS (cascade order) ---\n');
console.log(body);
