import { accessSync, readFileSync } from 'node:fs';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import stripJsonComments from 'strip-json-comments';

// --- Utilities ---

function findPkgDir(dir) {
  let current = dir;
  while (current !== dirname(current)) {
    try {
      accessSync(pathResolve(current, 'package.json'));
      return current;
    } catch {}
    current = dirname(current);
  }
}

function tryFile(path) {
  try { accessSync(path); return true; } catch { return false; }
}

function hasExtension(specifier) {
  return /\.(tsx?|js|json|mjs|cjs)$/.test(specifier);
}

// --- Path alias resolution (#/ imports via tsconfig paths) ---

const pkgCache = new Map();

function resolvePathAlias(specifier, parentDir) {
  if (!pkgCache.has(parentDir)) {
    const pkgDir = findPkgDir(parentDir);
    if (pkgDir) {
      try {
        const raw = readFileSync(pathResolve(pkgDir, 'tsconfig.json'), 'utf8');
        const tsconfig = JSON.parse(stripJsonComments(raw, { trailingCommas: true }));
        pkgCache.set(parentDir, { dir: pkgDir, paths: tsconfig.compilerOptions?.paths || {} });
      } catch {
        pkgCache.set(parentDir, null);
      }
    } else {
      pkgCache.set(parentDir, null);
    }
  }

  const cached = pkgCache.get(parentDir);
  if (!cached) return null;

  for (const [pattern, targets] of Object.entries(cached.paths)) {
    const prefix = pattern.replace('/*', '/');
    if (!specifier.startsWith(prefix)) continue;

    const rest = specifier.slice(prefix.length);
    for (const target of targets) {
      const mapped = target.replace('/*', `/${rest}`);
      const resolved = pathResolve(cached.dir, mapped);
      for (const ext of ['.ts', '.tsx']) {
        if (tryFile(`${resolved}${ext}`)) return { url: pathToFileURL(`${resolved}${ext}`).href, shortCircuit: true };
      }
      if (tryFile(`${resolved}/index.ts`)) return { url: pathToFileURL(`${resolved}/index.ts`).href, shortCircuit: true };
      if (tryFile(resolved)) return { url: pathToFileURL(resolved).href, shortCircuit: true };
    }
  }

  return null;
}

// --- Extensionless .ts/.tsx resolution ---

function resolveExtensionless(specifier, parentDir) {
  for (const ext of ['.ts', '.tsx']) {
    const tsPath = pathResolve(parentDir, `${specifier}${ext}`);
    if (tryFile(tsPath)) return `${specifier}${ext}`;
  }
  const indexPath = pathResolve(parentDir, specifier, 'index.ts');
  if (tryFile(indexPath)) return `${specifier}/index.ts`;
  return null;
}

// --- Node.js loader hooks ---

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('#') && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const result = resolvePathAlias(specifier, parentDir);
    if (result) return result;
  }

  if (!hasExtension(specifier) && specifier.startsWith('.') && context.parentURL) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const resolved = resolveExtensionless(specifier, parentDir);
    if (resolved) return nextResolve(resolved, context);
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.json') && !context.importAttributes?.type) {
    return nextLoad(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  }
  return nextLoad(url, context);
}
