import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, it } from 'vitest';
import { createBenchProcessEnv } from '../config';
import { getSchemaVersions, isInfrastructureReady } from '../preflight';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..', '..');

// Exercise the real short-mode CLI as a smoke check when the local stack is available.
describe('bench scenarios (short)', () => {
  let ready = false;

  beforeAll(async () => {
    if (!(await isInfrastructureReady())) {
      console.info('[bench smoke] skipped: local stack not reachable (run `pnpm dev` to enable).');
      return;
    }

    // The stack on the dev ports may come from another checkout: a schema other than this checkout's means other code.
    const { applied, checkout } = await getSchemaVersions();
    if (applied !== checkout) {
      console.info(
        `[bench smoke] skipped: the running stack's database is on migration ${applied ?? 'none'}, this checkout on ${checkout}. ` +
          'Run `pnpm dev` from this checkout to enable.',
      );
      return;
    }

    ready = true;
  });

  it('every scenario completes a short run', () => {
    if (!ready) return;

    // The exact CLI path users run; a non-zero exit throws and fails the test.
    execFileSync('tsx', ['src/bench-cli.ts', '--all', '--short'], { cwd: BENCH_ROOT, stdio: 'inherit', env: createBenchProcessEnv() });
  }, 120_000);
});
