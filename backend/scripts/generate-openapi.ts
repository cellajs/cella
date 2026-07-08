process.env.NODB = 'true';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { checkMark, crossMark } from '#/utils/console';

const CACHE_PATH = resolve(import.meta.dirname, '../openapi.cache.json');
const MANIFEST_PATH = resolve(import.meta.dirname, '../openapi.manifest.json');

// Paths that affect OpenAPI output (relative to backend/)
// Intentionally broad to avoid missing changes - false positives are safe, false negatives are not
const OPENAPI_RELEVANT_PATHS = [
  'src/',
];

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

/** Read diff hash from the build manifest */
function loadCachedDiffHash(): string | null {
  try {
    if (!existsSync(MANIFEST_PATH)) return null;
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
    return manifest['diffHash'] ?? null;
  } catch {
    return null;
  }
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

  const cachedHash = loadCachedDiffHash();
  if (!cachedHash) {
    return { skip: false, reason: 'no cache', hash: currentHash };
  }

  if (cachedHash === currentHash) {
    return { skip: true, reason: 'no changes', hash: currentHash };
  }

  return { skip: false, reason: 'files changed', hash: currentHash };
}

/**
 * Generate OpenAPI documentation and save it to a file.
 *
 * This script initializes the OpenAPI documentation for the application,
 * registers necessary schemas, and writes the generated OpenAPI document
 * to a JSON file. NODB is set to 'true' to avoid database connections during generation.
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
    const [{ baseApp: app }, { registerOpenApiDocs }] = await Promise.all([
      import('#/routes'),
      import('#/core/openapi-registration'),
    ]);

    await registerOpenApiDocs(app);

    // Record generation metadata in the manifest (used for cache invalidation, gitignored)
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ ...(hash && { diffHash: hash }), generatedAt: new Date().toISOString() }, null, 2),
    );

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info(`${checkMark} OpenAPI generation complete (${elapsed}s)`);
    process.exit(0);
  } catch (err) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

    // Check if this is a recoverable error (existing cache can be used)
    const hasFallbackCache = existsSync(CACHE_PATH);
    const isDevModeError = err instanceof Error && err.message.includes('NODB');

    if (hasFallbackCache && isDevModeError) {
      // Recoverable: NODB issue but we have an existing cache
      console.warn(`${checkMark} OpenAPI generation skipped — NODB unavailable, using existing cache (${elapsed}s)`);
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
