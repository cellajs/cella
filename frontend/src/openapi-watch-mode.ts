import { exec } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import type { Plugin } from 'vite';
import { openApiConfig } from '../openapi-ts.config';

const isValidUrl = (str: string) => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

const fileExists = (path: string) => {
  try {
    return fs.existsSync(path);
  } catch {
    return false;
  }
};

const getConfigInputPath = (input: unknown) => {
  if (typeof input === 'string') {
    if (!fileExists(input)) throw new Error('Invalid path in openapi Config');
    if (isValidUrl(input)) throw new Error('Input path is a URL in openapi Config');
    return input;
  }

  if (typeof input === 'object' && input !== null && 'path' in input) {
    const { path } = input;
    if (typeof path !== 'string') throw new Error('Path missing path in openapi Config');
    if (!fileExists(path)) throw new Error('Invalid path in openapi Config');
    if (isValidUrl(path)) throw new Error('Input path is a URL in openapi Config');
    return path;
  }

  throw new Error('Path missing path in openapi Config');
};

const filePath = getConfigInputPath(openApiConfig.input);

const hashFile = () => {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
};

export const watchBackendOpenApi = (): Plugin => {
  let previousHash = hashFile();
  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: NodeJS.Timeout | null = null;

  return {
    name: 'watch-backend-openapi',
    apply: 'serve',

    // Called when Vite starts or restarts plugin
    buildStart() {
      // Close watcher if exist it to avoid duplicate watchers and memory leaks
      if (watcher) {
        watcher.close();
        watcher = null;
      }

      watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          // If a debounce timer exists, clear it to
          if (debounceTimer) clearTimeout(debounceTimer);

          debounceTimer = setTimeout(() => {
            try {
              const newHash = hashFile();

              if (newHash !== previousHash) {
                previousHash = newHash;

                // Run regeneration command
                exec('pnpm openapi-ts', (err, stdout, stderr) => {
                  if (err) console.error('[openapi-ts] Error:', err);
                  else console.info('[openapi-ts] Regenerated typings:\n', stdout || stderr);
                });
              }
            } catch (e) {
              console.error('[openapi-ts] Failed to read or hash file:', e);
            }
          }, 100); // Debounce delay to batch multiple rapid changes
        }
      });
    },

    // Called when Vite server is shutting down or the plugin is being disposed
    closeBundle() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
};
