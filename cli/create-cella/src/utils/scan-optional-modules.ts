import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

/** An optional module discovered in a `*-module.ts` registration. */
export interface OptionalModule {
  name: string;
  description: string;
  /** Module folder, relative to the project root, removed when deselected. */
  folder: string;
}

/** Directories never worth scanning. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage']);

/**
 * Scan the template for `*-module.ts` files that register `optional: true` and return
 * their name, description and folder. Pure static regex parsing — no imports/eval — so it
 * runs before dependencies are installed. The folder is the module file's directory.
 */
export async function scanOptionalModules(targetFolder: string): Promise<OptionalModule[]> {
  const files: string[] = [];
  await collectModuleFiles(targetFolder, files);

  const modules: OptionalModule[] = [];
  for (const file of files) {
    const src = await readFile(file, 'utf8');
    if (!/optional:\s*true/.test(src)) continue;

    const name = src.match(/name:\s*['"]([^'"]+)['"]/)?.[1];
    const description = src.match(/description:\s*['"]([^'"]+)['"]/)?.[1] ?? '';
    if (!name) continue;

    modules.push({ name, description, folder: relative(targetFolder, dirname(file)) });
  }
  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every project-root-relative folder removed when an optional module is deselected: its own
 * module folder plus the route and static-asset folders it may own. Route folders are
 * speculative — a module owns either a pathless `_<name>` (URL-transparent) or a path-based
 * `<name>` route, under `routes/_public` and/or `routes/_app` — so callers remove only the
 * variants that actually exist. Single-sourced here so removal and tests stay in sync.
 */
export function optionalModuleFolders({ name, folder }: OptionalModule): string[] {
  return [
    folder,
    `frontend/src/routes/_public/_${name}`,
    `frontend/src/routes/_public/${name}`,
    `frontend/src/routes/_app/_${name}`,
    `frontend/src/routes/_app/${name}`,
    `frontend/public/static/${name}`,
  ];
}

async function collectModuleFiles(dir: string, out: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectModuleFiles(join(dir, entry.name), out);
    } else if (entry.name.endsWith('-module.ts')) {
      out.push(join(dir, entry.name));
    }
  }
}
