/**
 * Diff helpers for sync CLI v2.
 *
 * Shared logic for producing a single-file `git diff` (labeled cella/ vs fork/)
 * and for opening a visual diff in VS Code. Used by the analyze and
 * contributions services.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Run `git diff` for a single file across a ref range, labeling the sides
 * `cella/<path>` vs `<dstPrefix>/<path>` instead of opaque a/ and b/.
 *
 * @param cwd - Repo to run the diff in
 * @param range - Ref range (e.g. 'upstreamRef..HEAD')
 * @param filePath - File to diff
 * @param options.dstPrefix - Label for the destination side (e.g. the fork name)
 * @param options.color - 'always' for pager output, 'never' for machine output
 * @returns Raw diff output (empty when the file is identical)
 */
export function gitDiffFile(
  cwd: string,
  range: string,
  filePath: string,
  options: { dstPrefix: string; color?: 'always' | 'never' },
): Buffer {
  const args = ['diff'];
  if (options.color === 'always') args.push('--color=always');
  if (options.color === 'never') args.push('--no-color');
  args.push('--src-prefix=cella/', `--dst-prefix=${options.dstPrefix}/`, range, '--', filePath);

  const result = spawnSync('git', args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(stderr || `failed to diff ${filePath}`);
  }
  return result.stdout;
}

/**
 * Open a VS Code visual diff (`code --diff`) comparing the upstream version of a
 * file against the fork's working copy.
 *
 * Prefers the auto-managed upstream view worktree (a real checkout at the upstream
 * ref, byte-consistent with the unified diff). Falls back to materializing the
 * upstream blob into a temp file for paths absent from the worktree (e.g. files
 * just deleted upstream).
 */
export function openVsCodeDiff(
  forkPath: string,
  upstreamRef: string,
  viewPath: string | undefined,
  filePath: string,
): void {
  const forkFile = resolve(forkPath, filePath);

  // Preferred: diff against the upstream view worktree (real file, correct state).
  if (viewPath) {
    const upstreamFile = resolve(viewPath, filePath);
    if (existsSync(upstreamFile)) {
      spawnSync('code', ['--diff', upstreamFile, forkFile], { stdio: 'ignore' });
      return;
    }
  }

  // Fallback for files absent in the worktree (e.g. just-deleted upstream): materialize the blob.
  const tmpDir = mkdtempSync(join(tmpdir(), 'cella-analyze-diff-'));
  const fileName = filePath.split('/').pop() || 'file';
  const tmpFile = join(tmpDir, `upstream-${fileName}`);

  const result = spawnSync('git', ['show', `${upstreamRef}:${filePath}`], {
    cwd: forkPath,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = result.stderr.toString().trim();
    throw new Error(stderr || `failed to read upstream version for ${filePath}`);
  }

  writeFileSync(tmpFile, result.stdout);
  spawnSync('code', ['--diff', tmpFile, forkFile], { stdio: 'ignore' });
}
