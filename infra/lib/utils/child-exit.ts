import type { ChildProcess } from 'node:child_process';
import { errorMessage } from './errors';

/**
 * The exit code of a child once it ended. A child that cannot start, a missing binary, resolves 1 after naming why: an `error` event
 * nothing listens to would end the process, and with it the caller's `finally` that releases a stack lease.
 */
export function exitCodeOf(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (code: number) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    child.once('error', (error) => {
      console.error(`${child.spawnfile} failed to start: ${errorMessage(error)}`);
      settle(1);
    });
    child.once('close', (code) => settle(code ?? 1));
  });
}
