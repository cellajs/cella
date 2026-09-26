import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExitCodeError } from './errors';
import { runIfMain } from './is-main';

describe('runIfMain', () => {
  const argv = [...process.argv];
  afterEach(() => {
    process.argv = [...argv];
    vi.restoreAllMocks();
  });

  /** Runs `main` as if the file at `/tmp/task.ts` were the process entry, and returns the code it exits with. */
  async function exitCodeOf(main: () => Promise<void>): Promise<number | undefined> {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.argv[1] = '/tmp/task.ts';
    runIfMain('file:///tmp/task.ts', main);
    await vi.waitFor(() => expect(exit).toHaveBeenCalled());
    return exit.mock.calls[0]?.[0] as number | undefined;
  }

  it('exits with the code an ExitCodeError carries', async () => {
    expect(await exitCodeOf(async () => Promise.reject(new ExitCodeError('privileged change pending', 2)))).toBe(2);
  });

  it('exits 1 for any other failure', async () => {
    expect(await exitCodeOf(async () => Promise.reject(new Error('boom')))).toBe(1);
  });

  it('runs nothing when the module is imported', () => {
    const main = vi.fn(async () => undefined);
    process.argv[1] = '/tmp/other-entry.ts';
    runIfMain('file:///tmp/task.ts', main);
    expect(main).not.toHaveBeenCalled();
  });
});
