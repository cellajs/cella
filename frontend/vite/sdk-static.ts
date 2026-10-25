import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { buildDocsFiles } from '../../sdk/src/openapi-parser/docs-files.ts';

const sdkGenDir = resolve(import.meta.dirname, '../../sdk/gen');
const specPath = join(sdkGenDir, 'openapi.json');

/** The generated SDK files the docs pages fetch, as paths under sdk/gen. */
const sdkFiles = ['openapi.json', 'zod.gen.ts', 'types.gen.ts'];

/** Every docs.gen file, derived from the spec and derived again only when the spec file changes. */
let docsCache: { mtimeMs: number; files: Map<string, string> } | undefined;
const docsFiles = (): Map<string, string> => {
  if (!existsSync(specPath)) return new Map();
  const { mtimeMs } = statSync(specPath);
  if (docsCache?.mtimeMs !== mtimeMs) docsCache = { mtimeMs, files: buildDocsFiles(JSON.parse(readFileSync(specPath, 'utf-8'))) };
  return docsCache.files;
};

/**
 * Vite plugin: serves the API docs files at /static/... and emits them there in a build, so they are fetched, not
 * bundled. `openapi.json` and the type and zod indexes come from sdk/gen; `docs.gen/` is derived from that spec here.
 * A deploy writes its environment's spec over `sdk/gen/openapi.json` first, so both carry that environment's values.
 */
export const sdkStatic = (): Plugin => ({
  name: 'sdk-static',
  configureServer(server) {
    server.middlewares.use('/static', (req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '');
      const docsFile = path.startsWith('docs.gen/') ? docsFiles().get(path.slice('docs.gen/'.length)) : undefined;
      if (docsFile !== undefined) {
        res.setHeader('Content-Type', 'application/json');
        res.end(docsFile);
        return;
      }
      if (!sdkFiles.includes(path)) return next();
      const file = join(sdkGenDir, path);
      if (!existsSync(file)) return next();
      res.setHeader('Content-Type', extname(file) === '.json' ? 'application/json' : 'text/plain; charset=utf-8');
      res.end(readFileSync(file));
    });
  },
  generateBundle() {
    for (const file of sdkFiles) {
      const source = join(sdkGenDir, file);
      if (existsSync(source)) this.emitFile({ type: 'asset', fileName: `static/${file}`, source: readFileSync(source) });
    }
    for (const [file, source] of docsFiles()) this.emitFile({ type: 'asset', fileName: `static/docs.gen/${file}`, source });
  },
});
