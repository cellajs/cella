import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { openApiConfig } from '../openapi-ts.config';

/**
 * Incremental client generation script.
 *
 * Generates to a temp folder first, then compares with existing output.
 * Only updates the actual output if there are differences.
 *
 * This approach catches all changes including:
 * - OpenAPI spec changes
 * - Hey API version updates
 * - Plugin configuration changes
 */

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockFilePath = resolve(frontendDir, 'vite/.generate-client.lock');
// Use a unique temp folder name with random hash to avoid conflicts between concurrent runs
const tempFolderSuffix = createHash('sha256').update(`${Date.now()}-${process.pid}`).digest('hex').slice(0, 8);
const tempOutputPath = resolve(frontendDir, `vite/temp-api-gen-${tempFolderSuffix}`);
const finalOutputPath = resolve(frontendDir, 'src/api.gen');
const publicStaticPath = resolve(frontendDir, 'public/static');

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

const run = async () => {
  // Acquire lock to prevent concurrent runs from multiple terminals
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    console.info('⏳ Another generate-client process is running. Waited too long, exiting.');
    process.exit(1);
  }

  try {
    // Clean up any old temp folders from previous runs
    const viteDir = resolve(frontendDir, 'vite');
    try {
      const entries = readdirSync(viteDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('temp-api-gen-')) {
          rmSync(resolve(viteDir, entry.name), { recursive: true });
        }
      }
    } catch {
      // Ignore cleanup errors
    }

    // Ensure public/static directory exists for source output
    if (!existsSync(publicStaticPath)) {
      mkdirSync(publicStaticPath, { recursive: true });
    }

    console.info('🔄 Generating client to temp folder...');

    // Get output config
    const outputConfig = typeof openApiConfig.output === 'object' ? openApiConfig.output : {};
    const sourceConfig = 'source' in outputConfig ? outputConfig.source : undefined;
    const sourceFileName =
      sourceConfig && typeof sourceConfig === 'object' && 'fileName' in sourceConfig && sourceConfig.fileName
        ? String(sourceConfig.fileName)
        : 'openapi';

    // Run Hey API generation to temp folder
    await createClient({
      ...openApiConfig,
      output: {
        ...outputConfig,
        path: tempOutputPath,
        lint: null,
        format: null,
        // Override source path to use absolute path (relative paths break with temp folder)
        source: sourceConfig
          ? {
              ...(typeof sourceConfig === 'object' ? sourceConfig : {}),
              fileName: sourceFileName,
              path: publicStaticPath,
            }
          : undefined,
      },
    });

    // Format temp output with biome before comparing
    // Use try-catch to handle cases where biome may not process files (e.g., new directories)
    try {
      execSync(`pnpm biome check --write ${tempOutputPath}`, {
        cwd: frontendDir,
        stdio: 'pipe',
      });
    } catch {
      // Biome may fail if directory is newly created or empty, continue anyway
    }

    // Compare temp output with existing output
    const tempHash = hashDirectory(tempOutputPath);
    const existingHash = hashDirectory(finalOutputPath);

    if (tempHash === existingHash) {
      console.info('✅ Generated client unchanged — keeping existing output');
      rmSync(tempOutputPath, { recursive: true });
      return;
    }

    console.info('📝 Client changed — updating output...');

    // Remove existing output and replace with temp
    if (existsSync(finalOutputPath)) {
      rmSync(finalOutputPath, { recursive: true });
    }

    cpSync(tempOutputPath, finalOutputPath, { recursive: true });
    rmSync(tempOutputPath, { recursive: true });

    console.info('✅ Client generation complete');
  } finally {
    // Always release the lock when done
    releaseLock();
  }
};

run().catch((err) => {
  // Clean up temp on error
  if (existsSync(tempOutputPath)) {
    rmSync(tempOutputPath, { recursive: true });
  }
  releaseLock();
  console.error('❌ Client generation failed:', err);
  process.exit(1);
});
