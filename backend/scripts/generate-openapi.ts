process.env.DEV_MODE = 'none';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkMark, crossMark } from '#/utils/console';

const MANIFEST_PATH = resolve(import.meta.dirname, '../.openapi-manifest.json');

// Paths that affect OpenAPI output (relative to backend/)
// Intentionally broad to avoid missing changes - false positives are safe, false negatives are not
const OPENAPI_RELEVANT_PATHS = [
  'src/',
  'mocks/',
];

interface Manifest {
  gitDiffHash: string;
  generatedAt: string;
}

/** Get hash of git diff for relevant backend paths */
function getGitDiffHash(): string | null {
  try {
    const paths = OPENAPI_RELEVANT_PATHS.join(' ');
    const diff = execSync(`git diff --no-color HEAD -- ${paths}`, {
      cwd: resolve(import.meta.dirname, '..'),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large diffs
    });
    return createHash('sha256').update(diff).digest('hex').slice(0, 16);
  } catch {
    // Git not available or not a git repo - always regenerate
    return null;
  }
}

/** Load manifest from disk */
function loadManifest(): Manifest | null {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

/** Save manifest to disk */
function saveManifest(gitDiffHash: string): void {
  const manifest: Manifest = {
    gitDiffHash,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

/** Check if generation can be skipped */
function canSkipGeneration(): { skip: boolean; reason: string; hash: string | null } {
  // Check for --force flag
  if (process.argv.includes('--force')) {
    return { skip: false, reason: 'force flag', hash: null };
  }

  const currentHash = getGitDiffHash();
  if (currentHash === null) {
    return { skip: false, reason: 'git not available', hash: null };
  }

  const manifest = loadManifest();
  if (!manifest) {
    return { skip: false, reason: 'no manifest', hash: currentHash };
  }

  if (manifest.gitDiffHash === currentHash) {
    return { skip: true, reason: 'no changes', hash: currentHash };
  }

  return { skip: false, reason: 'files changed', hash: currentHash };
}

/**
 * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file. DEV_MODE is set to 'none' to avoid database connections during generation.
 *
 * Supports git-based caching: skips generation if no relevant files changed since last run.
 * Use --force flag to bypass the cache check.
 */
(async () => {
  const startTime = performance.now();

  // Check if we can skip generation
  const { skip, reason, hash } = canSkipGeneration();
  if (skip) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info(`${checkMark} OpenAPI generation skipped — ${reason} (${elapsed}s)`);
    process.exit(0);
  }

  try {
    const [{ default: app }, { default: docs }] = await Promise.all([
      import('#/routes'),
      import('#/docs/docs'),
    ]);

    await docs(app, true);

    // Update manifest after successful generation
    if (hash) saveManifest(hash);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info(`${checkMark} OpenAPI generation complete (${elapsed}s)`);
    process.exit(0);
  } catch (err) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    // Check if this is a recoverable error (existing cache can be used)
    const hasFallbackCache = existsSync(resolve(import.meta.dirname, '../openapi.cache.json'));
    const isDevModeError = err instanceof Error && err.message.includes('DEV_MODE');

    if (hasFallbackCache && isDevModeError) {
      // Recoverable: DEV_MODE issue but we have an existing cache
      console.warn(`${checkMark} OpenAPI generation skipped — DEV_MODE unavailable, using existing cache (${elapsed}s)`);
      process.exit(0);
    }

    if (hasFallbackCache) {
      // Recoverable: other error but cache exists
      console.warn(`${crossMark} OpenAPI generation failed, using existing cache (${elapsed}s)`);
      console.warn(err instanceof Error ? err.message : err);
      process.exit(0);
    }

    // Fatal: no cache to fall back on
    console.error(`${crossMark} Failed to generate OpenAPI cache — no fallback available (${elapsed}s)`);
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  }
})();