import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write a file with a restrictive mode set atomically at creation.
 *
 * Passing `mode` to writeFile applies it when the file is created, so a
 * fresh secret file is never briefly world-readable between create and chmod.
 * The trailing chmod tightens an already-existing file (whose mode writeFile
 * leaves untouched) and neutralises umask, so the result is exactly `mode`
 * whether the path was new or pre-existing. Every boot-time secret/config
 * write goes through here so the permission guarantee holds in one place.
 */
export async function writeFileMode(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, { encoding: 'utf-8', mode });
  await chmod(path, mode);
}
