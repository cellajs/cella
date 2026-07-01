import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ignore from 'ignore';

/**
 * Lists the files under `root` that git would track, without shelling out to git.
 *
 * Honors the root `.gitignore` (via the `ignore` package) and always skips `.git`
 * and `node_modules`. Used for the local-template dev flow (`--template ./local`)
 * so build output and local `.env` secrets aren't copied into the new project.
 *
 * Paths are returned relative to `root` using POSIX separators.
 */
export async function listTemplateFiles(root: string): Promise<string[]> {
  const ig = ignore().add(['.git', 'node_modules']);
  try {
    ig.add(await readFile(join(root, '.gitignore'), 'utf8'));
  } catch {
    // No .gitignore at the template root — only the defaults above apply.
  }

  const files: string[] = [];

  async function walk(relDir: string): Promise<void> {
    const entries = await readdir(relDir ? join(root, relDir) : root, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      // `ignore` matches directory rules when the path ends with a slash.
      if (ig.ignores(entry.isDirectory() ? `${rel}/` : rel)) continue;
      if (entry.isDirectory()) await walk(rel);
      else if (entry.isFile()) files.push(rel);
    }
  }

  await walk('');
  return files;
}
