/**
 * Unit tests for git output parsing utilities.
 *
 * Tests getFileChanges (diff-tree parsing) and getFileHashesAtRef (ls-tree parsing)
 * using real git repos to verify correct output interpretation.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getEffectiveMergeBase,
  getFileChanges,
  getFileHashesAtRef,
  getStoredSyncRef,
  isAncestor,
  listCommitsBetween,
  storeLastSyncRef,
} from '../src/utils/git';

/** Execute a shell command in a directory */
function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/** Create a minimal git repo with an initial commit */
function createRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-git-test-'));
  // -b main: don't depend on the runner's init.defaultBranch (CI defaults to master).
  exec('git init -b main', dir);
  exec('git config user.email "test@test.com" && git config user.name "Test"', dir);
  fs.writeFileSync(path.join(dir, 'initial.txt'), 'initial\n');
  exec('git add -A && git commit -m "initial"', dir);
  return dir;
}

describe('git parsing', () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = createRepo();
  });

  afterEach(() => {
    fs.rmSync(repoPath, { recursive: true, force: true });
  });

  describe('getFileHashesAtRef (ls-tree)', () => {
    it('should return hashes for all files at HEAD', async () => {
      const hashes = await getFileHashesAtRef(repoPath, 'HEAD');
      expect(hashes.size).toBe(1);
      expect(hashes.has('initial.txt')).toBe(true);
      // Hash should be a valid git object hash
      const hash = hashes.get('initial.txt')!;
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should track newly added files', async () => {
      fs.writeFileSync(path.join(repoPath, 'added.ts'), 'export const x = 1;\n');
      exec('git add -A && git commit -m "add file"', repoPath);

      const hashes = await getFileHashesAtRef(repoPath, 'HEAD');
      expect(hashes.size).toBe(2);
      expect(hashes.has('added.ts')).toBe(true);
      expect(hashes.has('initial.txt')).toBe(true);
    });

    it('should handle nested directory files', async () => {
      fs.mkdirSync(path.join(repoPath, 'src', 'deep'), { recursive: true });
      fs.writeFileSync(path.join(repoPath, 'src', 'deep', 'file.ts'), 'nested\n');
      exec('git add -A && git commit -m "add nested"', repoPath);

      const hashes = await getFileHashesAtRef(repoPath, 'HEAD');
      expect(hashes.has('src/deep/file.ts')).toBe(true);
    });

    it('should not include deleted files', async () => {
      fs.unlinkSync(path.join(repoPath, 'initial.txt'));
      exec('git add -A && git commit -m "delete initial"', repoPath);

      const hashes = await getFileHashesAtRef(repoPath, 'HEAD');
      expect(hashes.has('initial.txt')).toBe(false);
    });
  });

  describe('getFileChanges (diff-tree)', () => {
    it('should detect added files', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'new.ts'), 'new file\n');
      exec('git add -A && git commit -m "add new"', repoPath);

      const changes = await getFileChanges(repoPath, baseRef, 'HEAD');
      expect(changes.has('new.ts')).toBe(true);
      expect(changes.get('new.ts')!.status).toBe('A');
    });

    it('should detect modified files', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'initial.txt'), 'modified content\n');
      exec('git add -A && git commit -m "modify"', repoPath);

      const changes = await getFileChanges(repoPath, baseRef, 'HEAD');
      expect(changes.has('initial.txt')).toBe(true);
      expect(changes.get('initial.txt')!.status).toBe('M');
    });

    it('should detect deleted files', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      fs.unlinkSync(path.join(repoPath, 'initial.txt'));
      exec('git add -A && git commit -m "delete"', repoPath);

      const changes = await getFileChanges(repoPath, baseRef, 'HEAD');
      expect(changes.has('initial.txt')).toBe(true);
      expect(changes.get('initial.txt')!.status).toBe('D');
    });

    it('should detect renamed files with similarity', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      // Rename with git mv to ensure detection
      exec('git mv initial.txt renamed.txt', repoPath);
      exec('git commit -m "rename"', repoPath);

      const changes = await getFileChanges(repoPath, baseRef, 'HEAD');
      // Renamed files are keyed by the NEW path
      expect(changes.has('renamed.txt')).toBe(true);
      const change = changes.get('renamed.txt')!;
      expect(change.status).toBe('R');
      expect(change.oldPath).toBe('initial.txt');
    });

    it('should return empty map for identical refs', async () => {
      const ref = exec('git rev-parse HEAD', repoPath);
      const changes = await getFileChanges(repoPath, ref, ref);
      expect(changes.size).toBe(0);
    });

    it('should detect multiple changes in one diff', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      // Add, modify in one commit
      fs.writeFileSync(path.join(repoPath, 'initial.txt'), 'modified\n');
      fs.writeFileSync(path.join(repoPath, 'brand-new.ts'), 'new\n');
      exec('git add -A && git commit -m "multiple changes"', repoPath);

      const changes = await getFileChanges(repoPath, baseRef, 'HEAD');
      expect(changes.has('initial.txt')).toBe(true);
      expect(changes.has('brand-new.ts')).toBe(true);
      expect(changes.get('initial.txt')!.status).toBe('M');
      expect(changes.get('brand-new.ts')!.status).toBe('A');
    });
  });

  describe('listCommitsBetween', () => {
    it('should return commits oldest-first by default', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'a.txt'), 'a\n');
      exec('git add -A && git commit -m "commit A"', repoPath);

      fs.writeFileSync(path.join(repoPath, 'b.txt'), 'b\n');
      exec('git add -A && git commit -m "commit B"', repoPath);

      fs.writeFileSync(path.join(repoPath, 'c.txt'), 'c\n');
      exec('git add -A && git commit -m "commit C"', repoPath);

      const commits = await listCommitsBetween(repoPath, baseRef, 'HEAD');

      expect(commits).toHaveLength(3);
      expect(commits.map((c) => c.message)).toEqual(['commit A', 'commit B', 'commit C']);
    });

    it('should support skip and limit for showing the most recent window', async () => {
      const baseRef = exec('git rev-parse HEAD', repoPath);

      for (const n of [1, 2, 3, 4, 5]) {
        fs.writeFileSync(path.join(repoPath, `n${n}.txt`), `${n}\n`);
        exec(`git add -A && git commit -m "commit ${n}"`, repoPath);
      }

      const commits = await listCommitsBetween(repoPath, baseRef, 'HEAD', {
        oldestFirst: true,
        skip: 2,
        limit: 3,
      });

      expect(commits.map((c) => c.message)).toEqual(['commit 3', 'commit 4', 'commit 5']);
    });
  });

  describe('sync ref tracking', () => {
    it('should store and retrieve last-sync ref', async () => {
      const hash = exec('git rev-parse HEAD', repoPath);

      await storeLastSyncRef(repoPath, hash);
      const stored = await getStoredSyncRef(repoPath);

      expect(stored).toBe(hash);
    });

    it('should return null when no sync ref is stored', async () => {
      const stored = await getStoredSyncRef(repoPath);
      expect(stored).toBeNull();
    });

    it('should update stored ref on subsequent stores', async () => {
      const hash1 = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'second.txt'), 'second\n');
      exec('git add -A && git commit -m "second"', repoPath);
      const hash2 = exec('git rev-parse HEAD', repoPath);

      await storeLastSyncRef(repoPath, hash1);
      expect(await getStoredSyncRef(repoPath)).toBe(hash1);

      await storeLastSyncRef(repoPath, hash2);
      expect(await getStoredSyncRef(repoPath)).toBe(hash2);
    });
  });

  describe('isAncestor', () => {
    it('should return true when first is ancestor of second', async () => {
      const parent = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'child.txt'), 'child\n');
      exec('git add -A && git commit -m "child"', repoPath);
      const child = exec('git rev-parse HEAD', repoPath);

      expect(await isAncestor(repoPath, parent, child)).toBe(true);
    });

    it('should return false when first is not ancestor of second', async () => {
      const current = exec('git rev-parse HEAD', repoPath);

      fs.writeFileSync(path.join(repoPath, 'child.txt'), 'child\n');
      exec('git add -A && git commit -m "child"', repoPath);
      const child = exec('git rev-parse HEAD', repoPath);

      // Child is NOT an ancestor of current (parent)
      expect(await isAncestor(repoPath, child, current)).toBe(false);
    });

    it('should return true when both refs are the same', async () => {
      const ref = exec('git rev-parse HEAD', repoPath);
      expect(await isAncestor(repoPath, ref, ref)).toBe(true);
    });
  });

  describe('getEffectiveMergeBase', () => {
    it('should use git merge-base when no stored ref exists', async () => {
      // Create a branch to have two refs
      exec('git checkout -b feature', repoPath);
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);

      exec('git checkout main', repoPath);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      expect(result.isStale).toBe(false);
      expect(result.storedRef).toBeNull();
      expect(result.base).toBeTruthy();
    });

    it('should prefer stored ref when it is newer than git merge-base', async () => {
      // Create feature branch
      exec('git checkout -b feature', repoPath);

      // Add commits on feature
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);
      const featureHash = exec('git rev-parse HEAD', repoPath);

      exec('git checkout main', repoPath);

      // Store a ref that's the feature branch tip (newer than merge-base)
      await storeLastSyncRef(repoPath, featureHash);

      // Simulate a completed (squash) sync: the user commits, advancing HEAD past
      // the HEAD recorded by storeLastSyncRef. This is what marks the sync as done.
      fs.writeFileSync(path.join(repoPath, 'synced.txt'), 'synced\n');
      exec('git add -A && git commit -m "squash sync"', repoPath);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      // Stored ref (feature tip) is a descendant of merge-base (branch point)
      expect(result.storedRef).toBe(featureHash);
      expect(result.isStale).toBe(true);
      expect(result.base).toBe(featureHash);
    });

    it('should ignore stored ref left behind by an aborted merge (HEAD unchanged)', async () => {
      // Create feature branch with a commit, then return to main
      exec('git checkout -b feature', repoPath);
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);
      const featureHash = exec('git rev-parse HEAD', repoPath);
      exec('git checkout main', repoPath);

      const gitBase = exec('git merge-base main feature', repoPath);

      // Store the ref but do NOT advance HEAD — this mirrors a `git merge --abort`
      // where the staged sync ref persists but no merge commit was created.
      await storeLastSyncRef(repoPath, featureHash);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      // Guard must discard the stale ref and fall back to git's natural merge-base.
      expect(result.storedRef).toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.base).toBe(gitBase);
    });

    it('should trust stored ref when current HEAD committed the matching sync manifest', async () => {
      // Create feature branch with a commit, then return to main
      exec('git checkout -b feature', repoPath);
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);
      const featureHash = exec('git rev-parse HEAD', repoPath);
      exec('git checkout main', repoPath);

      // Simulate a squash-merged sync on main. The upstream commit is not in main's ancestry,
      // but the committed manifest records it as integrated.
      fs.writeFileSync(
        path.join(repoPath, 'cella.manifest.json'),
        `${JSON.stringify({ upstream: { commit: featureHash } }, null, 2)}\n`,
      );
      exec('git add -A && git commit -m "sync manifest"', repoPath);

      // A later aborted rerun can record the current HEAD as last-sync-head. The committed
      // manifest proves this is still a valid squash-sync base, not an unintegrated stale ref.
      await storeLastSyncRef(repoPath, featureHash);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      expect(result.storedRef).toBe(featureHash);
      expect(result.isStale).toBe(true);
      expect(result.base).toBe(featureHash);
    });

    it('should recover the squash-sync base from the committed manifest alone (fresh clone, no local refs)', async () => {
      // Create feature branch with a commit, then return to main
      exec('git checkout -b feature', repoPath);
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);
      const featureHash = exec('git rev-parse HEAD', repoPath);
      exec('git checkout main', repoPath);

      // Commit a manifest recording the squash-synced upstream commit, without storing any
      // local refs — the state of a fresh clone or a second maintainer's machine.
      fs.writeFileSync(
        path.join(repoPath, 'cella.manifest.json'),
        `${JSON.stringify({ upstream: { commit: featureHash } }, null, 2)}\n`,
      );
      exec('git add -A && git commit -m "sync manifest"', repoPath);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      expect(result.storedRef).toBe(featureHash);
      expect(result.isStale).toBe(true);
      expect(result.base).toBe(featureHash);
    });

    it('should not trust a manifest that only exists in the working tree (aborted sync)', async () => {
      // Create feature branch with a commit, then return to main
      exec('git checkout -b feature', repoPath);
      fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n');
      exec('git add -A && git commit -m "feature"', repoPath);
      const featureHash = exec('git rev-parse HEAD', repoPath);
      exec('git checkout main', repoPath);

      const gitBase = exec('git merge-base main feature', repoPath);

      // An aborted sync can leave the manifest in the working tree and the refs recorded at an
      // unadvanced HEAD. Nothing was committed, so nothing was integrated.
      fs.writeFileSync(
        path.join(repoPath, 'cella.manifest.json'),
        `${JSON.stringify({ upstream: { commit: featureHash } }, null, 2)}\n`,
      );
      await storeLastSyncRef(repoPath, featureHash);

      const result = await getEffectiveMergeBase(repoPath, 'main', 'feature');
      expect(result.storedRef).toBeNull();
      expect(result.isStale).toBe(false);
      expect(result.base).toBe(gitBase);
    });
  });
});
