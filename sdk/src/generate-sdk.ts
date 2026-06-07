import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import chokidar from 'chokidar';
import { changeMark, checkMark, crossMark, loadingMark, timestamp } from 'shared/console';
import { openApiConfig } from '../openapi-ts.config';

/**
 * SDK generation script with optional watch mode.
 *
 * One-shot: `node generate-sdk.ts` — generates SDK once
 * Watch:   `node generate-sdk.ts --watch` — watches openapi.cache.json and regenerates on change
 *
 * Generation is incremental: generates to a temp folder first, then compares
 * with existing output. Only updates the actual output if there are differences.
 *
 * This approach catches all changes including:
 * - OpenAPI spec changes
 * - Hey API version updates
 * - Plugin configuration changes
 */

const watchMode = process.argv.includes('--watch');

const srcDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(srcDir, '..');
const rootDir = resolve(sdkDir, '..');
const lockFilePath = resolve(srcDir, '.generate-sdk.lock');
const specHashFile = resolve(srcDir, '.spec-hash');
const specPath = resolve(rootDir, 'backend/openapi.cache.json');
// Single generated output tree: SDK code + openapi.json + docs.gen all live here.
const finalOutputPath = resolve(sdkDir, 'gen');

/** Small delay helper. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Acquire a lock to prevent concurrent runs.
 * Waits if another process holds the lock, with timeout.
 */
const acquireLock = async (maxWaitMs = 30000): Promise<boolean> => {
  const startTime = Date.now();
  const pid = process.pid.toString();

  while (Date.now() - startTime < maxWaitMs) {
    if (!existsSync(lockFilePath)) {
      // Try to create lock file with our PID
      try {
        writeFileSync(lockFilePath, pid, { flag: 'wx' });
        return true;
      } catch {
        // Another process beat us to it, wait and retry
        await delay(100);
        continue;
      }
    }

    // Lock exists - check if the holding process is still alive
    try {
      const lockPid = readFileSync(lockFilePath, 'utf-8').trim();
      const lockPidNum = Number.parseInt(lockPid, 10);

      // Check if process is still running
      try {
        process.kill(lockPidNum, 0); // Signal 0 just checks if process exists
        // Process is still running, wait
        await delay(200);
      } catch {
        // Process is dead, remove stale lock
        rmSync(lockFilePath, { force: true });
      }
    } catch {
      // Error reading lock file, try to remove it
      rmSync(lockFilePath, { force: true });
    }
  }

  return false;
};

/** Release the lock file. */
const releaseLock = () => {
  try {
    rmSync(lockFilePath, { force: true });
  } catch {
    // Ignore errors during cleanup
  }
};

/**
 * Recursively get all files in a directory.
 */
const getFilesRecursively = (dir: string): string[] => {
  const files: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Compute a combined hash of all files in a directory.
 */
const hashDirectory = (dir: string): string => {
  if (!existsSync(dir)) return '';

  const hash = createHash('sha256');
  const files = getFilesRecursively(dir);

  for (const file of files.sort()) {
    const relativePath = file.slice(dir.length);
    const content = readFileSync(file, 'utf-8');
    hash.update(`${relativePath}:${content}`);
  }

  return hash.digest('hex');
};

/** Hash the spec file content to detect actual changes. */
const hashSpec = (): string => {
  try {
    const content = readFileSync(specPath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
};

/** Read the previously stored spec hash. */
const readStoredHash = (): string => {
  try {
    return readFileSync(specHashFile, 'utf-8').trim();
  } catch {
    return '';
  }
};

/** Save the current spec hash to disk. */
const saveSpecHash = () => {
  try {
    const hash = hashSpec();
    if (hash) writeFileSync(specHashFile, hash, 'utf-8');
  } catch {}
};

/** Check if spec content has actually changed since last generation. */
const specChanged = (): boolean => {
  const current = hashSpec();
  if (!current) return true;
  return current !== readStoredHash();
};

/** Run the SDK generation. */
const generate = async () => {
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.info(`${timestamp()} ${loadingMark} Another generate-sdk process is running. Waited too long, skipping.`);
    if (!watchMode) process.exit(1);
    return;
  }

  const startTime = performance.now();

  // Generate unique temp folder paths per invocation
  const tempSuffix = createHash('sha256').update(`${Date.now()}-${process.pid}`).digest('hex').slice(0, 8);
  const tempOutputPath = resolve(srcDir, `temp-api-gen-${tempSuffix}`);
  // Docs JSON is generated inside the temp output tree so the entire sdk/gen
  // folder (SDK code + openapi.json + docs.gen) is generated and compared as one.
  const tempDocsPath = resolve(tempOutputPath, 'docs.gen');

  try {
    // Clean up any old temp folders from previous runs
    try {
      const entries = readdirSync(srcDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('temp-api-gen-')) {
          rmSync(resolve(srcDir, entry.name), { recursive: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    console.info(`${timestamp()} ${loadingMark} Generating SDK to temp folder...`);

    // Get output config
    const outputConfig = typeof openApiConfig.output === 'object' ? openApiConfig.output : {};
    const sourceConfig = 'source' in outputConfig ? outputConfig.source : undefined;
    const sourceFileName =
      sourceConfig && typeof sourceConfig === 'object' && 'fileName' in sourceConfig && sourceConfig.fileName
        ? String(sourceConfig.fileName)
        : 'openapi';

    // Configure plugins with temp docs output path
    // Cast through unknown to handle custom plugin properties not in Hey API's strict types
    const pluginsWithDocsPath = (openApiConfig.plugins || []).map((plugin) => {
      // If it's the openapi-parser plugin, add docsOutputPath to its config
      if (typeof plugin === 'object' && plugin !== null && 'name' in plugin) {
        const pluginObj = plugin as unknown as Record<string, unknown>;
        if (pluginObj.name === 'openapi-parser') {
          // Custom plugins have their config nested in a 'config' property
          const existingConfig = (pluginObj.config as Record<string, unknown>) || {};
          return {
            ...pluginObj,
            config: { ...existingConfig, docsOutputPath: tempDocsPath },
          };
        }
      }
      return plugin;
    }) as typeof openApiConfig.plugins;

    // Run Hey API generation to temp folder
    await createClient({
      ...openApiConfig,
      plugins: pluginsWithDocsPath,
      output: {
        ...outputConfig,
        path: tempOutputPath,
        // Override source path to use absolute path (relative paths break with temp folder)
        source: sourceConfig
          ? {
              ...(typeof sourceConfig === 'object' ? sourceConfig : {}),
              fileName: sourceFileName,
              path: tempOutputPath,
            }
          : undefined,
      },
    });

    // Format temp output with biome before comparing
    // Use try-catch to handle cases where biome may not process files (e.g., new directories)
    try {
      execFileSync('pnpm', ['biome', 'check', '--write', tempOutputPath], {
        cwd: rootDir,
        stdio: 'pipe',
      });
    } catch {
      // Biome may fail if directory is newly created or empty, continue anyway
    }

    // Compare temp output (SDK code + openapi.json + docs.gen) with existing output as one tree
    const changed = hashDirectory(tempOutputPath) !== hashDirectory(finalOutputPath);

    if (!changed) {
      saveSpecHash();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.info(
        `${timestamp()} [Openapi gen] ${checkMark} Generated SDK unchanged — keeping existing output (${elapsed}s)`,
      );
      return;
    }

    console.info(`${timestamp()} [Openapi gen] ${changeMark} SDK changed — updating output...`);

    // Helper to safely update a directory
    const updateDirectory = (tempPath: string, finalPath: string) => {
      if (!existsSync(tempPath)) return;

      if (!existsSync(finalPath)) {
        mkdirSync(finalPath, { recursive: true });
      }

      // Get list of files in both directories
      const newFiles = new Set(getFilesRecursively(tempPath).map((f) => f.slice(tempPath.length)));
      const oldFiles = existsSync(finalPath)
        ? getFilesRecursively(finalPath).map((f) => f.slice(finalPath.length))
        : [];

      // Copy all new files (this overwrites existing files atomically per-file)
      cpSync(tempPath, finalPath, { recursive: true });

      // Remove files that no longer exist in the new version
      for (const oldFile of oldFiles) {
        if (!newFiles.has(oldFile)) {
          const oldFilePath = resolve(finalPath, oldFile.slice(1)); // Remove leading slash
          if (existsSync(oldFilePath)) {
            rmSync(oldFilePath);
          }
        }
      }
    };

    // Update sdk/gen (SDK code + openapi.json + docs.gen) in one atomic pass
    updateDirectory(tempOutputPath, finalOutputPath);

    saveSpecHash();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info(`${timestamp()} [Openapi gen] ${checkMark} SDK generation complete (${elapsed}s)`);
  } finally {
    // Clean up temp folder (docs.gen is nested inside, removed with it)
    if (existsSync(tempOutputPath)) rmSync(tempOutputPath, { recursive: true });
    releaseLock();
  }
};

// ── Entry point ──────────────────────────────────────────────────────

if (watchMode) {
  let running = false;
  let queued = false;

  const triggerGeneration = async () => {
    if (!specChanged()) {
      console.info(`${timestamp()} ${checkMark} Spec unchanged, skipping regeneration`);
      return;
    }
    if (running) {
      queued = true;
      return;
    }
    running = true;
    console.info(`${timestamp()} ${loadingMark} Spec changed, regenerating SDK...`);
    try {
      await generate();
    } catch (err) {
      console.error(`${timestamp()} ${crossMark} Generation failed:`, err);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        void triggerGeneration();
      }
    }
  };

  // Run initial generation only if sdk/gen doesn't exist yet (first-time setup).
  // On subsequent dev starts, existing files work fine — the watcher handles spec changes.
  const indexFile = resolve(sdkDir, 'gen/index.ts');
  if (existsSync(specPath) && !existsSync(indexFile)) {
    if (!existsSync(lockFilePath)) {
      console.info(`${timestamp()} ${loadingMark} Running initial SDK generation...`);
      try {
        await generate();
      } catch (err) {
        console.error(`${timestamp()} ${crossMark} Initial generation failed:`, err);
      }
    } else {
      console.info(`${timestamp()} ${loadingMark} Another generate:sdk is running, skipping initial generation.`);
    }
  } else if (!existsSync(specPath)) {
    console.warn(`${timestamp()} ${crossMark} openapi.cache.json not found. Run \`pnpm sdk\` first.`);
  }

  // Watch for changes with chokidar
  const watcher = chokidar.watch(specPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('change', () => {
    void triggerGeneration();
  });

  console.info(`${timestamp()} ${checkMark} Watching openapi.cache.json for changes...`);

  // Clean shutdown
  const shutdown = () => {
    watcher.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else {
  generate().catch((err) => {
    console.error(`${timestamp()} [Openapi gen] ${crossMark} SDK generation failed:`, err);
    process.exit(1);
  });
}
