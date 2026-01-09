import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
const tempOutputPath = resolve(frontendDir, 'vite/temp-api-gen');
const finalOutputPath = resolve(frontendDir, 'src/api.gen');
const publicStaticPath = resolve(frontendDir, 'public/static');

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
  // Clean temp output if it exists from a previous failed run
  if (existsSync(tempOutputPath)) {
    rmSync(tempOutputPath, { recursive: true });
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
};

run().catch((err) => {
  // Clean up temp on error
  if (existsSync(tempOutputPath)) {
    rmSync(tempOutputPath, { recursive: true });
  }
  console.error('❌ Client generation failed:', err);
  process.exit(1);
});
