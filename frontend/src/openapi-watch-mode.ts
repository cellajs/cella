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

  return {
    name: 'watch-backend-openapi',
    apply: 'serve',
    // Called when plugin is initialized (on Vite start or restart)
    buildStart() {
      // If a watcher exists from previous plugin instance, close it
      if (watcher) {
        watcher.close();
        watcher = null;
      }

      // Create new watcher
      watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change') {
          try {
            const newHash = hashFile();
            if (newHash !== previousHash) {
              console.log(23);
              previousHash = newHash;
              exec('pnpm openapi-ts', (err, stdout, stderr) => {
                if (err) console.error('[openapi-ts] Error:', err);
                else console.info('[openapi-ts] Regenerated typings:\n', stdout || stderr);
              });
            }
          } catch (e) {
            console.error('[openapi-ts] Failed to read or hash file:', e);
          }
        }
      });
    },

    // Called when Vite server is stopping — clean up watcher here
    closeBundle() {
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
};
