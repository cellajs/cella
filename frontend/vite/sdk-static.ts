import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

const sdkGenDir = resolve(import.meta.dirname, '../../sdk/gen');

/** The generated SDK files the docs pages fetch, as paths under sdk/gen; a folder stands for every file in it. */
const servedPaths = ['openapi.json', 'zod.gen.ts', 'types.gen.ts', 'docs.gen'];

/** Every served file, relative to sdk/gen with forward slashes. */
const servedFiles = (): string[] =>
  servedPaths.flatMap((path) => {
    const full = join(sdkGenDir, path);
    if (!existsSync(full)) return [];
    if (!statSync(full).isDirectory()) return [path];
    return readdirSync(full, { recursive: true, encoding: 'utf8' })
      .filter((file) => statSync(join(full, file)).isFile())
      .map((file) => relative(sdkGenDir, join(full, file)).split(sep).join('/'));
  });

/**
 * Vite plugin: serves the generated API docs files at /static/... from sdk/gen, their single source, and emits them
 * there in a build, so they are fetched, not bundled.
 */
export const sdkStatic = (): Plugin => ({
  name: 'sdk-static',
  configureServer(server) {
    server.middlewares.use('/static', (req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '');
      if (!servedPaths.some((served) => path === served || path.startsWith(`${served}/`)) || path.includes('..')) return next();
      const file = join(sdkGenDir, path);
      if (!existsSync(file) || !statSync(file).isFile()) return next();
      res.setHeader('Content-Type', extname(file) === '.json' ? 'application/json' : 'text/plain; charset=utf-8');
      res.end(readFileSync(file));
    });
  },
  generateBundle() {
    for (const file of servedFiles()) this.emitFile({ type: 'asset', fileName: `static/${file}`, source: readFileSync(join(sdkGenDir, file)) });
  },
});
