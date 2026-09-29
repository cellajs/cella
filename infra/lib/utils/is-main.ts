import { pathToFileURL } from 'node:url';
import { ExitCodeError, errorMessage } from './errors';

/**
 * Whether the current module is the process entry point (run directly rather
 * than imported). Pass `import.meta.url` from the calling module:
 *
 *     if (isMain(import.meta.url)) await main()
 */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && importMetaUrl === pathToFileURL(entry).href;
}

/**
 * Run `main` when the module is the process entry point: a rejection prints its message (as a GitHub annotation under Actions, so the
 * failing step shows in the run summary) and exits with an `ExitCodeError`'s code, else 1. `runIfMain(import.meta.url, main)` is the
 * whole entry block of a task file.
 */
export function runIfMain(importMetaUrl: string, main: () => Promise<void>): void {
  if (!isMain(importMetaUrl)) return;
  main().catch((err) => {
    console.error(`${process.env.GITHUB_ACTIONS ? '::error::' : ''}${errorMessage(err)}`);
    process.exit(err instanceof ExitCodeError ? err.exitCode : 1);
  });
}
