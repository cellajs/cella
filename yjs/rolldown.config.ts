import { defineConfig, type RolldownOptions } from 'rolldown';
import { appKeepOnDisk } from '../backend/src/bundle-config.ts';
import { keepOnDisk } from '../shared/src/keep-on-disk.ts';
import pkg from './package.json' with { type: 'json' };

const { external } = keepOnDisk(appKeepOnDisk, pkg.dependencies);

// pino starts the OTLP log transport by path from the bundle's folder (shared/src/pino.ts).
const entries = { 'yjs-worker': 'src/yjs-worker.ts', 'otel-log-transport': '../shared/src/otel-log-transport.ts' };

// One build per entry, so each file is self-contained.
export default defineConfig(
  Object.entries(entries).map(([name, input], index): RolldownOptions => ({
    input: { [name]: input },
    platform: 'node',
    // One tsconfig for every file: backend/src files resolve `#/*` through this one, where their own may be missing.
    tsconfig: 'tsconfig.json',
    external,
    resolve: { mainFields: ['module', 'main'] },
    // An import nothing resolves would stay a bare import that crashes at start, so it fails the build.
    onLog(level, log, handler) {
      if (log.code === 'UNRESOLVED_IMPORT') return handler('error', log);
      handler(level, log);
    },
    output: { dir: 'dist', format: 'esm', sourcemap: true, codeSplitting: false, cleanDir: index === 0 },
  })),
);
