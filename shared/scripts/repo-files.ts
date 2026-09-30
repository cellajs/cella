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

/** Repo-relative files git tracks, plus untracked ones it does not ignore, that exist on disk, in `git ls-files` order. */
export function repoFiles(root = repoRoot): string[] {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file && existsSync(join(root, file)));
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

/** `file:line:column [rule] "term": message`; a finding about the path itself prints the path alone. */
export function formatFinding({ file, line, column, rule, term, message }: Finding): string {
  const location = line === undefined ? file : `${file}:${line}:${column}`;
  return `${location} [${rule}] ${term === undefined ? '' : `"${term}": `}${message}`;
}
