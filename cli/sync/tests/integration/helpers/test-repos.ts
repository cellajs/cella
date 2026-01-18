/**
 * Test repository helpers for sync integration tests.
 *
 * Uses a clone + cache pattern:
 * 1. Clone the test fixture repo to a temp cache (once per test run)
 * 2. Create fresh working copies for each test
 * 3. Clean up after tests complete
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** GitHub repo containing the test fixture */
const FIXTURE_REPO = 'https://github.com/cellajs/sync-test-fixture.git';

/** Local cache directory for the bare clone */
const CACHE_DIR = path.join(os.tmpdir(), 'cella-sync-test-cache');

/** Git user config for test commits */
const GIT_CONFIG = 'git config user.email "test@cella.js" && git config user.name "Test"';

/**
 * Execute a shell command synchronously.
 */
function exec(cmd: string, cwd?: string): string {
  return execSync(cmd, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Ensure the fixture repo is cached locally (bare clone).
 * Only clones if the cache doesn't exist.
 */
export async function ensureFixtureCache(): Promise<void> {
  if (fs.existsSync(CACHE_DIR)) {
    // Update the cache
    try {
      exec('git fetch --all --tags', CACHE_DIR);
    } catch {
      // If fetch fails, remove and re-clone
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
    }
  }

  if (!fs.existsSync(CACHE_DIR)) {
    console.log('Cloning test fixture repo to cache...');
    exec(`git clone --bare ${FIXTURE_REPO} ${CACHE_DIR}`);
  }
}

/**
 * Check if the fixture cache exists.
 */
export function hasFixtureCache(): boolean {
  return fs.existsSync(CACHE_DIR);
}

/**
 * Clear the fixture cache (useful for CI or manual cleanup).
 */
export function clearFixtureCache(): void {
  if (fs.existsSync(CACHE_DIR)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  }
}

/**
 * Test environment containing upstream and fork repos.
 */
export interface TestEnv {
  /** Root temp directory for this test */
  testDir: string;
  /** Path to the upstream repo (simulates cellajs/cella) */
  upstreamPath: string;
  /** Path to the fork repo (simulates user's app) */
  forkPath: string;
  /** Clean up the test environment */
  cleanup: () => void;
}

/**
 * Create a fresh test environment with upstream and fork repos.
 *
 * @param options - Configuration for the test environment
 * @returns TestEnv with paths and cleanup function
 */
export async function createTestEnv(
  options: {
    /** Tag/branch to checkout for upstream (default: main) */
    upstreamRef?: string;
    /** Tag/branch to checkout for fork's starting point (default: v1.0.0) */
    forkStartRef?: string;
    /** Name for the fork branch (default: main) */
    forkBranch?: string;
  } = {},
): Promise<TestEnv> {
  const { upstreamRef = 'main', forkStartRef = 'v1.0.0', forkBranch = 'main' } = options;

  // Ensure cache exists
  await ensureFixtureCache();

  // Create temp directory for this test
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-sync-test-'));
  const upstreamPath = path.join(testDir, 'upstream');
  const forkPath = path.join(testDir, 'fork');

  try {
    // Clone upstream from cache at specified ref
    exec(`git clone ${CACHE_DIR} ${upstreamPath}`);
    exec(`git checkout ${upstreamRef}`, upstreamPath);
    exec(GIT_CONFIG, upstreamPath);

    // Clone fork from cache at fork start ref
    // Use --no-checkout to avoid creating default branch, then checkout the ref we want
    exec(`git clone --no-checkout ${CACHE_DIR} ${forkPath}`);
    exec(`git checkout -B ${forkBranch} ${forkStartRef}`, forkPath);
    exec(GIT_CONFIG, forkPath);

    // Add upstream as remote in fork (simulating cella-upstream)
    exec(`git remote add cella-upstream ${upstreamPath}`, forkPath);
    exec('git fetch cella-upstream', forkPath);
  } catch (error) {
    // Cleanup on failure
    fs.rmSync(testDir, { recursive: true, force: true });
    throw error;
  }

  return {
    testDir,
    upstreamPath,
    forkPath,
    cleanup: () => {
      fs.rmSync(testDir, { recursive: true, force: true });
    },
  };
}

/**
 * Helper to make a commit in a test repo.
 */
export function makeCommit(
  repoPath: string,
  options: {
    files: Record<string, string>;
    message: string;
  },
): string {
  const { files, message } = options;

  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoPath, filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  }

  exec('git add -A', repoPath);
  exec(`git commit -m "${message}"`, repoPath);

  return exec('git rev-parse HEAD', repoPath);
}

/**
 * Helper to delete a file and commit.
 */
export function deleteFileAndCommit(repoPath: string, filePath: string, message: string): string {
  const fullPath = path.join(repoPath, filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
  exec('git add -A', repoPath);
  exec(`git commit -m "${message}"`, repoPath);
  return exec('git rev-parse HEAD', repoPath);
}

/**
 * Get the content of a file in a repo.
 */
export function readRepoFile(repoPath: string, filePath: string): string | null {
  const fullPath = path.join(repoPath, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Check if a file exists in a repo.
 */
export function fileExists(repoPath: string, filePath: string): boolean {
  return fs.existsSync(path.join(repoPath, filePath));
}

/**
 * Get current branch name.
 */
export function getCurrentBranch(repoPath: string): string {
  return exec('git rev-parse --abbrev-ref HEAD', repoPath);
}

/**
 * Get list of files changed between two refs.
 */
export function getChangedFiles(repoPath: string, fromRef: string, toRef: string): string[] {
  const output = exec(`git diff --name-only ${fromRef}..${toRef}`, repoPath);
  return output ? output.split('\n').filter(Boolean) : [];
}
