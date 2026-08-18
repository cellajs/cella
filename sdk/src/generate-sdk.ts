import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import chokidar from 'chokidar';
import { changeMark, checkMark, crossMark, loadingMark, timestamp } from 'shared/utils/console';
import { openApiConfig } from '../openapi-ts.config';

const watchMode = process.argv.includes('--watch');

const srcDir = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(srcDir, '..');
const rootDir = resolve(sdkDir, '..');
const lockFilePath = resolve(srcDir, '.generate-sdk.lock');
const specHashFile = resolve(srcDir, '.spec-hash');
const specPath = resolve(rootDir, 'backend/openapi.cache.json');
// Single generated output tree: SDK code + openapi.json + docs.gen all live here.
const finalOutputPath = resolve(sdkDir, 'gen');

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Prevents concurrent runs: waits out a lock held by a live process, up to `maxWaitMs`. */
const acquireLock = async (maxWaitMs = 30000): Promise<boolean> => {
  const startTime = Date.now();
  const pid = process.pid.toString();

  while (Date.now() - startTime < maxWaitMs) {
    if (!existsSync(lockFilePath)) {
      try {
        writeFileSync(lockFilePath, pid, { flag: 'wx' });
        return true;
      } catch {
        // Another process won the create, so wait and retry.
        await delay(100);
        continue;
      }
    }

    try {
      const lockPid = readFileSync(lockFilePath, 'utf-8').trim();
      const lockPidNum = Number.parseInt(lockPid, 10);

      try {
        process.kill(lockPidNum, 0); // Signal 0 just checks if process exists
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

const releaseLock = () => {
  try {
    rmSync(lockFilePath, { force: true });
  } catch {
    // Ignore errors during cleanup
  }
};

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

const readStoredHash = (): string => {
  try {
    return readFileSync(specHashFile, 'utf-8').trim();
  } catch {
    return '';
  }
};

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

/** Generates into a temp folder and overwrites `sdk/gen` only when the output differs, so unchanged runs trigger no HMR. */
const generate = async () => {
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.info(`${timestamp()} ${loadingMark} Another generate-sdk process is running. Waited too long, skipping.`);
    if (!watchMode) process.exit(1);
    return;
  }

  const startTime = performance.now();

  const tempSuffix = createHash('sha256').update(`${Date.now()}-${process.pid}`).digest('hex').slice(0, 8);
  const tempOutputPath = resolve(srcDir, `temp-api-gen-${tempSuffix}`);
  // Docs JSON sits inside the temp tree so all of sdk/gen is generated and compared as one.
  const tempDocsPath = resolve(tempOutputPath, 'docs.gen');

  try {
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

    const outputConfig = typeof openApiConfig.output === 'object' ? openApiConfig.output : {};
    const sourceConfig = 'source' in outputConfig ? outputConfig.source : undefined;
    const sourceFileName =
      sourceConfig && typeof sourceConfig === 'object' && 'fileName' in sourceConfig && sourceConfig.fileName
        ? String(sourceConfig.fileName)
        : 'openapi';

    // Cast through unknown to handle custom plugin properties not in Hey API's strict types
    const pluginsWithDocsPath = (openApiConfig.plugins || []).map((plugin) => {
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

    // The temp folder is gitignored, so `--vcs-use-ignore-file=false` keeps biome from skipping it and leaving hey-api's raw output; a non-zero exit is fine, zero files processed is not.
    const biomeResult = spawnSync(
      'pnpm',
      ['biome', 'check', '--write', '--vcs-use-ignore-file=false', tempOutputPath],
      {
        cwd: rootDir,
        encoding: 'utf-8',
      },
    );
    const biomeOutput = `${biomeResult.stdout ?? ''}${biomeResult.stderr ?? ''}`;
    if (biomeResult.error || /No files were processed/.test(biomeOutput)) {
      console.warn(
        `${timestamp()} [Openapi gen] ${crossMark} Biome formatted no files: generated output left unformatted`,
        biomeResult.error ?? biomeOutput,
      );
    }

    const changed = hashDirectory(tempOutputPath) !== hashDirectory(finalOutputPath);

    if (!changed) {
      saveSpecHash();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      console.info(
        `${timestamp()} [Openapi gen] ${checkMark} Generated SDK unchanged: keeping existing output (${elapsed}s)`,
      );
      return;
    }

    console.info(`${timestamp()} [Openapi gen] ${changeMark} SDK changed: updating output...`);

    const updateDirectory = (tempPath: string, finalPath: string) => {
      if (!existsSync(tempPath)) return;

      if (!existsSync(finalPath)) {
        mkdirSync(finalPath, { recursive: true });
      }

      const newFiles = new Set(getFilesRecursively(tempPath).map((f) => f.slice(tempPath.length)));
      const oldFiles = existsSync(finalPath)
        ? getFilesRecursively(finalPath).map((f) => f.slice(finalPath.length))
        : [];

      // Overwrites existing files atomically per file.
      cpSync(tempPath, finalPath, { recursive: true });

      for (const oldFile of oldFiles) {
        if (!newFiles.has(oldFile)) {
          const oldFilePath = resolve(finalPath, oldFile.slice(1)); // Remove leading slash
          if (existsSync(oldFilePath)) {
            rmSync(oldFilePath);
          }
        }
      }
    };

    updateDirectory(tempOutputPath, finalOutputPath);

    saveSpecHash();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    console.info(`${timestamp()} [Openapi gen] ${checkMark} SDK generation complete (${elapsed}s)`);
  } finally {
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

  // First-time setup only: on later dev starts the watcher picks up spec changes.
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

  const watcher = chokidar.watch(specPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  watcher.on('change', () => {
    void triggerGeneration();
  });

  console.info(`${timestamp()} ${checkMark} Watching openapi.cache.json for changes...`);

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
