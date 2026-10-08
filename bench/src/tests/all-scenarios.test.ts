import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'vitest';
import { createBenchProcessEnv } from '../config';

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const BENCH_ROOT = resolve(__dirname, '..', '..');

// Exercise the real short-mode CLI as a smoke check when the local stack is available.
describe('bench scenarios (short)', () => {
  it('every scenario completes a short run', () => {
    // The exact CLI path users run; a non-zero exit throws and fails the test. Vitest's NODE_ENV=test is dropped: it puts
    // the CLI on the test config, with other ports and another session cookie name than the dev stack has. For the same
    // reason the CLI decides by itself, through `--if-ready`, whether this checkout has a stack to run against.
    const env = createBenchProcessEnv({ NODE_ENV: undefined });
    execFileSync('tsx', ['src/bench-cli.ts', '--all', '--short', '--if-ready'], { cwd: BENCH_ROOT, stdio: 'inherit', env });
  }, 120_000);
});
