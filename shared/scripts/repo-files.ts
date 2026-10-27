/** File listing, path filters, positions and the finding shape the style checks share. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** One style finding. `review` findings print under `--audit` only and never fail the check. */
export interface Finding {
  file: string;
  /** 1-based; absent when the finding is about the path itself. */
  line?: number;
  column?: number;
  rule: string;
  term?: string;
  message: string;
  review?: boolean;
}

/**
 * Runs `run`, which may rewrite files under `paths`, and restores those paths from git afterwards: also when `run`
 * throws, and when the process is interrupted while a command of `run` is under way. Exits 1 without running when
 * a path holds uncommitted changes, since the restore would discard them.
 */
export function withRestoredPaths(paths: string[], run: () => void): void {
  const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (git(['status', '--porcelain', '--', ...paths]).trim()) {
    console.error(`Commit the changes under ${paths.join(' and ')} first: the check restores them from git.`);
    process.exit(1);
  }
  // With a handler set, an interrupt ends the running command and its error reaches the `finally` below.
  const interrupted = () => process.exit(130);
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    run();
  } finally {
    git(['checkout', '--', ...paths]);
    process.off('SIGINT', interrupted);
    process.off('SIGTERM', interrupted);
  }
}

/** Repo-relative files git tracks, plus untracked ones it does not ignore, that exist on disk, in `git ls-files` order. */
export function repoFiles(): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && existsSync(join(repoRoot, file)));
}

/** Whether `file` is the path `entry` or inside it; `entry` may end in `/`. */
export function isUnder(file: string, entry: string): boolean {
  return file === entry || file.startsWith(entry.endsWith('/') ? entry : `${entry}/`);
}

/** Whether `file` is one of the requested roots or inside one; no roots requests every file. */
export function isRequested(file: string, roots: string[]): boolean {
  return roots.length === 0 || roots.some((root) => isUnder(file, root.replace(/^\.\//, '').replace(/\/$/, '')));
}

/** App sources under frontend/src, outside generated files, content, stories and tests: the files the frontend convention rules read. */
export function isFrontendSource(file: string): boolean {
  return (
    /^frontend\/src\/.*\.tsx?$/.test(file) &&
    !file.includes('.gen.') &&
    !file.includes('/content/') &&
    !file.includes('/stories/') &&
    !/\.(?:stories|test)\.tsx?$/.test(file)
  );
}

/** `text` with every character but a line break turned into a space, so offsets and line numbers into it still hold. */
export function blankOut(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/** 1-based line and column of `offset`, counting `\n` line breaks only. */
export function lineColumn(source: string, offset: number): { line: number; column: number } {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

/** `file:line:column [rule] "term": message`; a finding about the path itself prints the path alone. */
export function formatFinding({ file, line, column, rule, term, message }: Finding): string {
  const location = line === undefined ? file : `${file}:${line}:${column}`;
  return `${location} [${rule}] ${term === undefined ? '' : `"${term}": `}${message}`;
}
