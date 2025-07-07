import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Temporary vite plugin to replace Zod imports in generated OpenAPI client files.
 * This is necessary due to the change in Zod's import path in version 4.
 */
export function replaceZodImport(): Plugin {
  const checkFilePath = path.resolve(__dirname, './api.gen/zod.gen.ts');

  return {
    name: 'patch-openapi-client-zod-imports',
    apply: 'serve',

    configureServer(server) {
      // Watch the specific file
      server.watcher.add(checkFilePath);

      // Initial patch if the file already exists
      if (fs.existsSync(checkFilePath)) {
        patchZodImports(path.dirname(checkFilePath));
      }

      server.watcher.on('change', (filePath) => {
        if (path.resolve(filePath) === checkFilePath) {
          patchZodImports(path.dirname(checkFilePath));
        }
      });

      server.watcher.on('add', (filePath) => {
        if (path.resolve(filePath) === checkFilePath) {
          patchZodImports(path.dirname(checkFilePath));
        }
      });
    },
  };
}

function patchZodImports(targetDir: string) {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir).flatMap((name) => {
      const entry = path.join(dir, name);
      return fs.statSync(entry).isDirectory() ? walk(entry) : [entry];
    });

  const files = walk(targetDir).filter((f) => /\.(ts|tsx|js|jsx)$/.test(f));

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const updated = content.replace(/\bfrom\s+['"]zod['"]/g, `from 'zod/v4'`);

    if (updated !== content) {
      fs.writeFileSync(file, updated, 'utf-8');
      console.info(`🩹 Patched ${file}`);
    }
  }
}
