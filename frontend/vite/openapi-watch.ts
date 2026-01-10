import { exec } from 'node:child_process';
import { existsSync, type FSWatcher, watch } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { openApiConfig } from '../openapi-ts.config';

/**
 * Vite plugin that watches the backend OpenAPI spec file for changes.
 * When changes are detected, it triggers client regeneration.
 *
 * Also suppresses error spam if api.gen goes missing while Vite is running.
 *
 * The actual change detection (whether output differs) is handled by
 * the generate-client.ts script, so this plugin just needs to trigger it.
 */

const getPath = (config: unknown): string => {
  if (typeof config === 'string') return config;
  if (typeof config === 'object' && config !== null && 'path' in config) {
    return (config as { path: string }).path;
  }
  throw new Error('Cannot determine path from openapi config');
};

export const openApiWatch = (): Plugin => {
  const inputFilePath = resolve(import.meta.dirname, '..', getPath(openApiConfig.input));
  const outputPath = resolve(import.meta.dirname, '..', getPath(openApiConfig.output));
  const indexPath = resolve(outputPath, 'index.ts');

  if (!existsSync(inputFilePath)) {
    console.warn(`[openapi-watch] Input file not found: ${inputFilePath}`);
  }

  let viteServer: ViteDevServer | null = null;
  let watcher: FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;
  let isRegenerating = false;
  let apiGenMissingWarned = false;

  /** Check if api.gen exists and has the index file */
  const apiGenExists = () => existsSync(outputPath) && existsSync(indexPath);

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
    name: 'watch-backend-openapi',
    apply: 'serve',
    enforce: 'pre', // Run before other plugins

    configureServer(server) {
      viteServer = server;

      // Proper cleanup when dev server closes
      server.httpServer?.on('close', cleanup);

      // Override Vite's logger to suppress api.gen errors when folder is missing
      const originalError = server.config.logger.error;
      server.config.logger.error = (msg, options) => {
        // Suppress api.gen related errors when folder is missing
        if (typeof msg === 'string' && msg.includes('api.gen') && !apiGenExists()) {
          if (!apiGenMissingWarned) {
            apiGenMissingWarned = true;
            originalError(
              '\n[openapi-watch] ❌ api.gen is missing. Run `pnpm generate:openapi` to regenerate.\n',
              options,
            );
          }
          return; // Suppress the original error
        }
        originalError(msg, options);
      };

      // Watch api.gen folder - if it disappears, show one warning
      const apiGenWatcher = watch(outputPath, { persistent: false }, (eventType) => {
        if (eventType === 'rename' && !apiGenExists() && !apiGenMissingWarned) {
          apiGenMissingWarned = true;
          console.error('\n[openapi-watch] ❌ api.gen was deleted. Run `pnpm generate:openapi` to regenerate.\n');
        }
        // Reset when api.gen comes back
        if (apiGenExists() && apiGenMissingWarned) {
          apiGenMissingWarned = false;
          console.info('[openapi-watch] ✅ api.gen restored');
        }
      });

      server.httpServer?.on('close', () => apiGenWatcher.close());
    },

    // Intercept imports to provide empty module
    resolveId(source) {
      if (source.includes('api.gen') && !apiGenExists()) {
        return { id: '\0empty-api-gen', moduleSideEffects: false };
      }
      return null;
    },

    load(id) {
      if (id === '\0empty-api-gen') {
        return 'export default {}';
      }
      return null;
    },

    buildStart() {
      // Clean up any existing watcher to avoid duplicates
      cleanup();

      watcher = watch(inputFilePath, (eventType) => {
        if (eventType !== 'change' || isRegenerating) return;

        // Debounce rapid changes
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
          isRegenerating = true;

          // Temporarily stop Vite from reacting to output folder changes
          const chokidarWatcher = viteServer?.watcher;
          chokidarWatcher?.unwatch(outputPath);

          console.info('[openapi-watch] Backend spec changed, regenerating client...');

          exec('pnpm generate-client', { cwd: import.meta.dirname }, (err, stdout, stderr) => {
            isRegenerating = false;
            chokidarWatcher?.add(outputPath);

            if (err) {
              console.error('[openapi-watch] Error:', stderr || err.message);
              return;
            }

            // Log output (trimmed)
            const output = (stdout || stderr).trim();
            if (output) {
              // Extract just the status line
              const statusLine = output.split('\n').find((line) => line.startsWith('✅') || line.startsWith('📝'));
              if (statusLine) console.info(`[openapi-watch] ${statusLine}`);
            }

            // Trigger HMR reload
            viteServer?.ws.send({ type: 'full-reload' });
          });
        }, 150);
      });
    },

    buildEnd() {
      cleanup();
    },
  };
};
