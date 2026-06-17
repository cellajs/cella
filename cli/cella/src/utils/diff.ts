/**
 * Diff helpers for sync CLI v2.
 *
 * Shared logic for opening a visual diff in VS Code, used by both the analyze
 * service (`--open-diff`) and any other consumer that needs an upstream-vs-fork
 * comparison.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
