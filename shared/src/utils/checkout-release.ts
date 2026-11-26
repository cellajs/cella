import { execFileSync } from 'node:child_process';

/**
 * The commit a local checkout is at: the release of a process started without `RELEASE_SHA`, and of a frontend built
 * without it. An image always has `RELEASE_SHA`, the builder's commit.
 * @returns The full commit hash, or `unknown` outside a git checkout.
 */
export function checkoutRelease(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}
