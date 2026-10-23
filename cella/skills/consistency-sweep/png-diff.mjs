#!/usr/bin/env node
// Compares two folders of same-named PNG screenshots pixel by pixel and writes a diff image per mismatch.
// Usage: node png-diff.mjs <worktree> <dirA> <dirB> <outDir>
// Prints one line per pair: identical, or the number and share of differing pixels (tolerance: 8/255 per channel).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [worktree, dirA, dirB, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node png-diff.mjs <worktree> <dirA> <dirB> <outDir>');
  process.exit(2);
}
const storeDir = path.join(worktree, 'node_modules/.pnpm');
const pngDir = readdirSync(storeDir).find((d) => d.startsWith('pngjs@'));
const { PNG } = await import(path.join(storeDir, pngDir, 'node_modules/pngjs/lib/png.js'));

mkdirSync(outDir, { recursive: true });
const TOLERANCE = 8;
let worst = 0;

for (const name of readdirSync(dirA).filter((f) => f.endsWith('.png')).sort()) {
  const other = path.join(dirB, name);
  if (!existsSync(other)) {
    console.log(`MISSING  ${name} (only in ${dirA})`);
    continue;
  }
  const a = PNG.sync.read(readFileSync(path.join(dirA, name)));
  const b = PNG.sync.read(readFileSync(other));
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`SIZE     ${name}: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    worst = Math.max(worst, 1);
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
      Math.abs(a.data[i + 3] - b.data[i + 3]),
    );
    const same = delta <= TOLERANCE;
    if (!same) differing++;
    // Faded original with differing pixels in red.
    const grey = Math.round((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3) * 0.3 + 178;
    diff.data[i] = same ? grey : 255;
    diff.data[i + 1] = same ? grey : 0;
    diff.data[i + 2] = same ? grey : 0;
    diff.data[i + 3] = 255;
  }
  const total = a.width * a.height;
  const share = differing / total;
  worst = Math.max(worst, share);
  if (differing === 0) console.log(`same     ${name}`);
  else {
    writeFileSync(path.join(outDir, name.replace(/\.png$/, '.diff.png')), PNG.sync.write(diff));
    console.log(`DIFF     ${name}: ${differing} px (${(share * 100).toFixed(3)}%)`);
  }
}
process.exit(worst > 0 ? 1 : 0);
