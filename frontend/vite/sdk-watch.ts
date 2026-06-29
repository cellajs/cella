import { existsSync, type FSWatcher, watch } from 'node:fs';
import { resolve } from 'node:path';
import { checkMark, crossMark } from 'shared/console';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Vite plugin that watches the SDK output for changes and triggers a full reload.
 *
 * The actual spec watching and SDK regeneration is handled by the SDK's
 * own generate-sdk script (sdk/src/generate-sdk.ts --watch). This plugin
 * only reacts to the final output in sdk/gen/ to trigger browser reloads.
 *
 * Also provides graceful degradation if sdk/gen/ is missing (virtual empty module).
 */
export const sdkWatch = (): Plugin => {
  const sdkGenDir = resolve(import.meta.dirname, '../../sdk/gen');
  const indexPath = resolve(sdkGenDir, 'index.ts');

  let viteServer: ViteDevServer | null = null;
  let watcher: FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let sdkMissingWarned = false;

  const sdkGenExists = () => existsSync(sdkGenDir) && existsSync(indexPath);

  const cleanup = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  };

  return {
    name: 'watch-sdk-output',
    apply: 'serve',
    enforce: 'pre',

    configureServer(server) {
      viteServer = server;
      server.httpServer?.on('close', cleanup);

      // Suppress sdk/gen error spam when folder is missing
      const originalError = server.config.logger.error;
      server.config.logger.error = (msg, options) => {
        if (typeof msg === 'string' && msg.includes('sdk/gen') && !sdkGenExists()) {
          if (!sdkMissingWarned) {
            sdkMissingWarned = true;
            originalError(`\n[sdk-watch] ${crossMark} sdk/gen is missing. Run \`pnpm sdk\` to generate.\n`, options);
          }
          return;
        }
        originalError(msg, options);
      };
    },

    // Provide empty module fallback when sdk/gen is missing
    resolveId(source) {
      if (source.includes('sdk/gen') && !sdkGenExists()) {
        return { id: '\0empty-sdk', moduleSideEffects: false };
      }
      return null;
    },

    load(id) {
      if (id === '\0empty-sdk') {
        return 'export default {}';
      }
      return null;
    },

    buildStart() {
      cleanup();

      if (!existsSync(indexPath)) {
        console.warn(`[sdk-watch] ${crossMark} sdk/gen/index.ts not found, waiting for generation...`);
      }

      // Watch sdk/gen directory — triggers when generate-sdk updates the output
      watcher = watch(sdkGenDir, (eventType) => {
        if (eventType !== 'change' && eventType !== 'rename') return;

        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
          // Reset missing warning when sdk/gen comes back
          if (sdkMissingWarned && sdkGenExists()) {
            sdkMissingWarned = false;
            console.info(`[sdk-watch] ${checkMark} sdk/gen restored`);
          }

          if (sdkGenExists()) {
            console.info(`[sdk-watch] ${checkMark} SDK output changed, reloading...`);
            viteServer?.ws.send({ type: 'full-reload' });
          }
        }, 200);
      });
    },

    buildEnd() {
      cleanup();
    },
  };
};
