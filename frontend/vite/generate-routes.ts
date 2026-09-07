/** Regenerates `src/routes/routeTree.gen.ts` without a Vite build or dev server, e.g. after a sync adds a route file. */
import { fileURLToPath } from 'node:url';
import { Generator, getConfig } from '@tanstack/router-generator';
import { routerOptions } from './router-options.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
await new Generator({ config: getConfig(routerOptions, root), root }).run();
console.info(`[gen:routes] wrote ${routerOptions.generatedRouteTree}`);
