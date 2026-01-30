/**
 * E2E test environment helpers.
 *
 * Creates local git repos for testing sync services without network dependencies.
 * Each test gets isolated upstream + fork repos that are cleaned up after.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CellaCliConfig, RuntimeConfig, SyncService } from '../../../src/config/types';

/** Git config for test commits */
const GIT_USER = 'git config user.email "test@cellajs.com" && git config user.name "Cella Test"';

/** Upstream remote name used by sync CLI */
const UPSTREAM_REMOTE = 'cella-upstream';

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
 * Test environment with upstream and fork repos.
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
 * Both repos start with the same initial commit, then can be modified
 * independently to create various sync scenarios.
 */
export function createTestEnv(): TestEnv {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cella-e2e-'));
  const upstreamPath = path.join(testDir, 'upstream');
  const forkPath = path.join(testDir, 'fork');

  // Create upstream repo with initial content
  fs.mkdirSync(upstreamPath);
  exec('git init', upstreamPath);
  exec(GIT_USER, upstreamPath);

  // Create initial files
  fs.mkdirSync(path.join(upstreamPath, 'backend', 'src'), { recursive: true });
  fs.mkdirSync(path.join(upstreamPath, 'frontend', 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(upstreamPath, 'backend', 'src', 'index.ts'),
    '// Backend entry\nexport const backend = true;\n',
  );
  fs.writeFileSync(
    path.join(upstreamPath, 'frontend', 'src', 'index.ts'),
    '// Frontend entry\nexport const frontend = true;\n',
  );
  fs.writeFileSync(path.join(upstreamPath, 'README.md'), '# Test Repo\n');
  fs.writeFileSync(path.join(upstreamPath, 'package.json'), '{"name": "test-upstream"}\n');

  exec('git add -A && git commit -m "Initial commit"', upstreamPath);

  // Clone to create fork (same starting point)
  exec(`git clone ${upstreamPath} ${forkPath}`);
  exec(GIT_USER, forkPath);

  // Rename origin to cella-upstream in fork (simulating sync setup)
  exec(`git remote rename origin ${UPSTREAM_REMOTE}`, forkPath);

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
 * Make a commit in a repo with the given files.
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
 * Delete a file and commit.
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
 * Read a file from a repo. Returns null if file doesn't exist.
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
 * Fetch upstream changes into fork.
 */
export function fetchUpstream(forkPath: string): void {
  exec(`git fetch ${UPSTREAM_REMOTE}`, forkPath);
}

/**
 * Write a cella.config.ts to the fork.
 */
export function writeTestConfig(
  forkPath: string,
  options: {
    pinned?: string[];
    ignored?: string[];
    mergeStrategy?: 'merge' | 'squash';
  } = {},
): void {
  const { pinned = [], ignored = [], mergeStrategy = 'squash' } = options;

  const config = `import { defineConfig } from './cli/cella/src/config/types';

export default defineConfig({
  settings: {
    upstreamUrl: 'local-test',
    upstreamBranch: 'main',
    forkBranch: 'main',
    mergeStrategy: '${mergeStrategy}',
  },
  overrides: {
    pinned: ${JSON.stringify(pinned)},
    ignored: ${JSON.stringify(ignored)},
  },
});
`;

  fs.writeFileSync(path.join(forkPath, 'cella.config.ts'), config);
}

/**
 * Build a RuntimeConfig for testing without going through CLI.
 */
export function buildRuntimeConfig(
  env: TestEnv,
  options: {
    service?: SyncService;
    pinned?: string[];
    ignored?: string[];
    mergeStrategy?: 'merge' | 'squash';
  } = {},
): RuntimeConfig {
  const { service = 'analyze', pinned = [], ignored = [], mergeStrategy = 'squash' } = options;

  const config: CellaCliConfig = {
    settings: {
      upstreamUrl: env.upstreamPath,
      upstreamBranch: 'main',
      forkBranch: 'main',
      mergeStrategy,
    },
    overrides: {
      pinned,
      ignored,
    },
  };

  return {
    ...config,
    forkPath: env.forkPath,
    upstreamRef: `${UPSTREAM_REMOTE}/main`,
    service,
    logFile: false,
    verbose: false,
  };
}

/**
 * Reset fork to a clean state (abort any in-progress merge).
 */
export function resetFork(forkPath: string): void {
  try {
    exec('git merge --abort', forkPath);
  } catch {
    // Ignore if no merge in progress
  }
  exec('git checkout .', forkPath);
  exec('git clean -fd', forkPath);
}
