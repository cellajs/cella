import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the `infra/` package root, derived from this file's location (`infra/lib/utils/`). */
export const infraDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** This machine's folder for the app, in the home folder and outside every checkout: what it holds serves each checkout and worktree here. */
export const machineDir = (appSlug: string): string => join(homedir(), '.config', appSlug);

/**
 * A new file's path under `infra/.debug/`, which git ignores and this makes: `<stem>-<time>.<extension>`.
 * @throws when the folder cannot be made
 */
export function debugFile(stem: string, extension: string): string {
  const dir = resolve(infraDir, '.debug');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, `${stem}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`);
}
