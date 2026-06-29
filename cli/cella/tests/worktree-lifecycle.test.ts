/**
 * Tests for the upstream view worktree lifecycle.
 *
 * Covers `refreshViewWorktree` (the persistent "clean at next start" worktree
 * backing VS Code diffs) and `cleanupLeftoverWorktrees` (pruning orphaned refs
 * for both the sync and view worktree prefixes).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupLeftoverWorktrees,
  getViewWorktreePath,
  getWorktreePath,
  refreshViewWorktree,
} from '../src/utils/cleanup';
import { createWorktree, listWorktrees, removeWorktree } from '../src/utils/git';

function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function createRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-worktree-test-'));
  exec('git init -b main', dir);
  exec('git config user.email "test@test.com" && git config user.name "Test"', dir);
  fs.writeFileSync(path.join(dir, 'initial.txt'), 'initial\n');
  exec('git add -A && git commit -m "initial"', dir);
  return dir;
}

describe('view worktree lifecycle', () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = createRepo();
  });

  afterEach(async () => {
    // Remove any worktrees we materialized in tmpdir, then the repo itself.
    for (const wtPath of [getViewWorktreePath(repoPath), getWorktreePath(repoPath)]) {
      await removeWorktree(repoPath, wtPath);
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  describe('refreshViewWorktree', () => {
    it('checks out the upstream ref into the view worktree path', async () => {
      const viewPath = await refreshViewWorktree(repoPath, 'HEAD');

      expect(viewPath).toBe(getViewWorktreePath(repoPath));
      expect(fs.existsSync(viewPath)).toBe(true);
      expect(fs.readFileSync(path.join(viewPath, 'initial.txt'), 'utf-8')).toBe('initial\n');
    });

    it('removes and recreates a stale worktree on a subsequent run', async () => {
      await refreshViewWorktree(repoPath, 'HEAD');

      // Advance HEAD, then refresh again — the worktree should reflect new content.
      fs.writeFileSync(path.join(repoPath, 'initial.txt'), 'updated\n');
      exec('git add -A && git commit -m "update"', repoPath);

      const viewPath = await refreshViewWorktree(repoPath, 'HEAD');
      expect(fs.readFileSync(path.join(viewPath, 'initial.txt'), 'utf-8')).toBe('updated\n');
    });

    it('recovers when the worktree directory was deleted out from under git', async () => {
      const viewPath = await refreshViewWorktree(repoPath, 'HEAD');

      // Simulate a crash that left an orphaned git worktree registration.
      fs.rmSync(viewPath, { recursive: true, force: true });

      // Refresh should prune the orphan and recreate cleanly.
      const recreated = await refreshViewWorktree(repoPath, 'HEAD');
      expect(fs.existsSync(recreated)).toBe(true);
    });
  });

  describe('cleanupLeftoverWorktrees', () => {
    it('prunes orphaned refs for both sync and view prefixes', async () => {
      const syncPath = getWorktreePath(repoPath);
      const viewPath = getViewWorktreePath(repoPath);
      await createWorktree(repoPath, syncPath, 'HEAD');
      await createWorktree(repoPath, viewPath, 'HEAD');

      // Orphan both by deleting their directories (registrations remain in git).
      fs.rmSync(syncPath, { recursive: true, force: true });
      fs.rmSync(viewPath, { recursive: true, force: true });

      await cleanupLeftoverWorktrees(repoPath);

      const worktrees = await listWorktrees(repoPath);
      expect(worktrees).not.toContain(syncPath);
      expect(worktrees).not.toContain(viewPath);
    });

    it('leaves a live view worktree intact', async () => {
      const viewPath = await refreshViewWorktree(repoPath, 'HEAD');

      await cleanupLeftoverWorktrees(repoPath);

      expect(fs.existsSync(viewPath)).toBe(true);
    });
  });
});
