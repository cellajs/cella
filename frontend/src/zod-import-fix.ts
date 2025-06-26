import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

export function replaceZodImport(): Plugin {
  const openApiPath = path.resolve(__dirname, './openapi-client/zod.gen.ts');

  return {
    name: 'patch-openapi-client-zod-imports',
    apply: 'serve',

    configureServer(server) {
      // Watch the specific file
      server.watcher.add(openApiPath);

      server.watcher.on('change', (filePath) => {
        if (path.resolve(filePath) === openApiPath) {
          console.log(`[patch] Detected change in: ${filePath}`);
          patchZodImports(path.dirname(openApiPath));
        }
      });

      server.watcher.on('add', (filePath) => {
        if (path.resolve(filePath) === openApiPath) {
          console.log(`[patch] New file added: ${filePath}`);
          patchZodImports(path.dirname(openApiPath));
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
      console.log(`[patched] ${file}`);
    }
  }
}
