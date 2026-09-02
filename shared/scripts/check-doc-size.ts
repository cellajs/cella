/**
 * Reports the word count of every tracked Markdown file against a committed baseline so docs
 * shrink on purpose and grow on purpose. `--write-baseline` records the current counts;
 * `--gate` exits non-zero when a file exceeds its baseline by more than the growth allowance.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const baselinePath = join(here, 'doc-size-baseline.json');
const excludedFiles = new Set(['cella/CHANGELOG.md']);
/** Fraction a file may grow past its baseline before `--gate` fails. */
const growthAllowance = 0.1;

interface Baseline {
  recordedAt: string;
  files: Record<string, number>;
}

function trackedMarkdown(): string[] {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && !excludedFiles.has(file) && existsSync(join(repoRoot, file)))
    .sort();
}

function countWords(file: string): number {
  const source = readFileSync(join(repoRoot, file), 'utf8');
  return source.split(/\s+/).filter(Boolean).length;
}

function currentCounts(): Record<string, number> {
  return Object.fromEntries(trackedMarkdown().map((file) => [file, countWords(file)]));
}

function readBaseline(): Baseline | null {
  return existsSync(baselinePath) ? (JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline) : null;
}

function writeBaseline(files: Record<string, number>): void {
  const baseline: Baseline = { recordedAt: new Date().toISOString().slice(0, 10), files };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`[docs:size] baseline written for ${Object.keys(files).length} files.`);
}

/** Print per-file deltas against the baseline; return 1 when `gate` is set and a file outgrew its allowance. */
export function runDocSizeCheck(gate: boolean): number {
  const current = currentCounts();
  const baseline = readBaseline();
  if (!baseline) {
    console.error('[docs:size] no baseline yet, run with --write-baseline first.');
    return 1;
  }

  const rows: string[] = [];
  let currentTotal = 0;
  let baselineTotal = 0;
  let grown = 0;
  for (const [file, words] of Object.entries(current)) {
    const before = baseline.files[file];
    currentTotal += words;
    if (before === undefined) {
      rows.push(`  ${String(words).padStart(6)}   (new)  ${file}`);
      continue;
    }
    baselineTotal += before;
    const delta = words - before;
    const pct = before ? Math.round((delta / before) * 100) : 0;
    if (delta > before * growthAllowance) grown += 1;
    if (delta !== 0) rows.push(`  ${String(words).padStart(6)}  ${String(pct).padStart(4)}%  ${file}`);
  }
  for (const file of Object.keys(baseline.files)) {
    if (!(file in current)) rows.push(`       0  gone   ${file}`);
  }

  const totalPct = baselineTotal ? Math.round(((currentTotal - baselineTotal) / baselineTotal) * 100) : 0;
  console.log(
    `[docs:size] ${currentTotal} words in ${Object.keys(current).length} files, ${totalPct}% vs baseline ${baseline.recordedAt} (${baselineTotal}).`,
  );
  for (const row of rows) console.log(row);
  if (gate && grown > 0) {
    console.error(
      `[docs:size] ${grown} file(s) grew more than ${growthAllowance * 100}% past baseline; trim or rewrite the baseline.`,
    );
    return 1;
  }
  return 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  if (process.argv.includes('--write-baseline')) writeBaseline(currentCounts());
  else process.exitCode = runDocSizeCheck(process.argv.includes('--gate'));
}
