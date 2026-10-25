#!/usr/bin/env node
// Compiles the project's Tailwind CSS for the given classes and prints the rules in cascade order; NONE marks a class
// that emits nothing. Usage: node tw-check.mjs <repo root> <class> [<class> ...]. See SKILL.md.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const [worktree, ...candidates] = process.argv.slice(2);
if (!worktree || candidates.length === 0) {
  console.error('usage: node tw-check.mjs <worktree> <class> [<class> ...]');
  process.exit(2);
}

// @tailwindcss/node is a dependency of @tailwindcss/vite, so it only exists in pnpm's store folder.
const storeDir = path.join(worktree, 'node_modules/.pnpm');
const nodeDir = readdirSync(storeDir).find((d) => d.startsWith('@tailwindcss+node@'));
if (!nodeDir) throw new Error(`no @tailwindcss/node in ${storeDir}`);
const { compile } = await import(path.join(storeDir, nodeDir, 'node_modules/@tailwindcss/node/dist/index.mjs'));

const cssFile = path.join(worktree, 'frontend/src/styling/tailwind.css');
const css = readFileSync(cssFile, 'utf8')
  // Source scanning is irrelevant here: candidates are passed explicitly.
  .replace(/@source[^;]*;/g, '');

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
