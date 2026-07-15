/**
 * Bench smoke test: runs every scenario through the real CLI in `--short` mode
 * (1s/1 VU, no thresholds/baselines) to catch scenarios that break after a
 * route/schema change. A smoke check, not a performance gate.
 *
 * Skips itself when the local stack is unreachable, so the monorepo `vitest` run
 * doesn't require `pnpm dev`.
 */

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, it } from 'vitest';
import { createBenchProcessEnv } from '../config';
import { isInfrastructureReady } from '../preflight';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..', '..');

describe('bench scenarios (short)', () => {
  let ready = false;

  beforeAll(async () => {
    ready = await isInfrastructureReady();
    if (!ready) {
      console.info('[bench smoke] skipped — local stack not reachable (run `pnpm dev` to enable).');
    }
  });

  it('every scenario completes a short run', () => {
    if (!ready) return;

    // Reuse the exact CLI path users run: `pnpm bench --all --short`.
    // Throws (failing the test) on a non-zero exit, e.g. a scenario erroring out.
    execFileSync('tsx', ['src/bench-cli.ts', '--all', '--short'], {
      cwd: BENCH_ROOT,
      stdio: 'inherit',
      env: createBenchProcessEnv(),
    });
  }, 120_000);
});
