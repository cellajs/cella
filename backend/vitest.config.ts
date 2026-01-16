import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for backend tests.
 *
 * Supports three test modes via TEST_MODE env variable:
 * - `basic`: Fast unit tests only (no database), no Docker required
 * - `core`: Full tests with PostgreSQL container, excludes integration tests
 * - `full`: Complete suite with PostgreSQL, includes integration (CDC) tests
 *
 * @example
 * ```bash
 * TEST_MODE=basic pnpm test    # Fast unit tests only
 * TEST_MODE=core pnpm test     # Standard, PostgreSQL (default)
 * TEST_MODE=full pnpm test     # Complete suite with integration tests
 * ```
 *
 * @link https://vitest.dev/config/
 */

const testMode = process.env.TEST_MODE || 'core';
const isBasic = testMode === 'basic';
const isCore = testMode === 'core';
const isFull = testMode === 'full';

// Include patterns based on mode
const includePatterns = ['src/**/*.test.ts']
if (isCore || isFull) includePatterns.concat(['tests/**/*.test.ts', 'mocks/**/*.test.ts']);

// Exclude patterns if not in full mode
const excludePatterns = ['**/node_modules/**'];
if (isBasic || isCore) excludePatterns.push('tests/integration/**');


export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(__dirname, './src'),
      '#json': path.resolve(__dirname, '../json'),
    },
  },
  // Suppress "Sourcemap" warnings from node_modules with broken sourcemaps
  logLevel: 'error',
  test: {
    // Only use global setup for modes that need PostgreSQL
    globalSetup: isBasic ? undefined : './tests/global-setup.ts',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    pool: 'threads',
    include: includePatterns,
    exclude: excludePatterns,
    env: {
      PINO_LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      // basic mode: skip database connection entirely
      // core/full: use PostgreSQL test container
      ...(isBasic
        ? { SKIP_DB: '1' }
        : { DATABASE_URL: 'postgres://postgres:postgres@0.0.0.0:5434/postgres' }),
    },
  },
});
