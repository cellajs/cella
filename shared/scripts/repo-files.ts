/** File listing, path filters and source positions shared by the style checks. */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const listings = new Map<string, string[]>();

/**
 * Repo-relative files git tracks that exist on disk, in `git ls-files` order. Unless `trackedOnly`, untracked files
 * git does not ignore are included. One listing per root serves every check in the process.
 */
export function repoFiles(root = repoRoot, trackedOnly = false): string[] {
  const key = `${trackedOnly}:${root}`;
  let files = listings.get(key);
  if (!files) {
    const args = trackedOnly ? ['ls-files'] : ['ls-files', '-co', '--exclude-standard'];
    files = execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((file) => file && existsSync(join(root, file)));
    listings.set(key, files);
  }
  return files;
}

/** Whether `file` is one of the requested roots or inside one; no roots requests every file. */
export function isRequested(file: string, roots: string[]): boolean {
  if (roots.length === 0) return true;
  return roots.some((root) => {
    const normalized = root.replace(/^\.\//, '').replace(/\/$/, '');
    return file === normalized || file.startsWith(`${normalized}/`);
  });
}

/** 1-based line and column of `offset`, counting `\n` line breaks only. */
export function lineColumn(source: string, offset: number): { line: number; column: number } {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}

/** Whether the module at `url` is the script node started with, also when started through a symlinked path. */
export function isMain(url: string): boolean {
  const started = process.argv[1];
  return !!started && existsSync(started) && realpathSync(started) === realpathSync(fileURLToPath(url));
}

/** Where a check writes: the console when run alone, a buffer when the style pass runs the checks together. */
export interface Output {
  log: (line: string) => void;
  error: (line: string) => void;
}

/** Writes `<label> <count> <noun>:` and one indented line per finding; nothing when there are none. */
export function writeFindings(write: (line: string) => void, label: string, noun: string, findings: string[]): void {
  if (findings.length === 0) return;
  write(`${label} ${findings.length} ${noun}:`);
  for (const finding of findings) write(`  ${finding}`);
}
