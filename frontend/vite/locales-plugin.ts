import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { HmrContext, ModuleNode, Plugin, ViteDevServer } from 'vite';

/** Custom HMR event name sent to the client when locale files change */
const CUSTOM_EVENT = 'i18next-hmr:update' as const;

/** Configuration options for the locales plugin */
interface LocalesPluginOptions {
  /** Source directory containing locale files (default: ../locales) */
  srcDir?: string;
  /** Output cache directory for processed locales (default: ../.vscode/.locales-cache) */
  outDir?: string;
  /** Namespace merge configuration - merges source namespaces into target */
  merge?: {
    /** Target runtime namespace to merge into (e.g., 'c') */
    target: string;
    /** Source namespaces to merge from (e.g., ['common', 'app']) */
    sources: string[];
  };
  /** Enable verbose logging (default: true) */
  verbose?: boolean;
}

/**
 * Resolve user options with defaults.
 */
function resolveOptions(userOptions: LocalesPluginOptions = {}): Required<LocalesPluginOptions> {
  return {
    srcDir: userOptions.srcDir ?? path.resolve(process.cwd(), '../locales'),
    outDir: userOptions.outDir ?? path.resolve(process.cwd(), '../.vscode/.locales-cache'),
    merge: userOptions.merge ?? { target: 'c', sources: ['common', 'app'] },
    verbose: userOptions.verbose ?? true,
  };
}

/**
 * Conditional logger that respects verbose setting.
 */
function log(level: 'info' | 'warn' | 'error', message: string, verbose: boolean, ...args: unknown[]) {
  if (!verbose && level === 'info') return;
  const prefix = '[locales]';
  switch (level) {
    case 'info':
      console.info(prefix, message, ...args);
      break;
    case 'warn':
      console.warn(prefix, message, ...args);
      break;
    case 'error':
      console.error(prefix, message, ...args);
      break;
  }
}

/**
 * Check if a file path is a locale asset (JSON/YAML in a locales directory).
 */
function isLocaleAsset(file: string, srcDir: string): boolean {
  const rel = path.relative(srcDir, file);
  // File must be inside srcDir (not outside or absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;

  const posix = file.split(path.sep).join(path.posix.sep);
  return /(?:^|\/)locales\/.+\.(?:json|ya?ml)$/i.test(posix);
}

/**
 * Read a JSON file, returning empty object if it doesn't exist.
 */
async function readJsonIfExists(file: string): Promise<Record<string, unknown>> {
  try {
    const content = await fsp.readFile(file, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return {};
    }
    throw err;
  }
}

/**
 * Sync one language directory to the cache: merge configured source namespaces into the target
 * namespace, and copy the remaining namespaces as-is.
 */
async function syncLanguage(lang: string, options: Required<LocalesPluginOptions>): Promise<void> {
  const { srcDir, outDir, merge, verbose } = options;
  const srcLangDir = path.join(srcDir, lang);

  if (!fs.existsSync(srcLangDir)) {
    log('warn', `language dir "${srcLangDir}" does not exist, skipping`, verbose);
    return;
  }

  const outLangDir = path.join(outDir, lang);
  await fsp.mkdir(outLangDir, { recursive: true });

  const entries = await fsp.readdir(srcLangDir, { withFileTypes: true });

  // Read all namespace JSON files into memory
  const resources: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map(async (e) => {
        const ns = path.basename(e.name, '.json');
        const srcFile = path.join(srcLangDir, e.name);
        resources[ns] = await readJsonIfExists(srcFile);
      }),
  );

  // Merge source namespaces into target namespace (later sources override earlier ones)
  const targetNs = merge.target;
  const sourceNamespaces = new Set(merge.sources);

  const mergedTarget: Record<string, unknown> = {};
  for (const ns of merge.sources) {
    Object.assign(mergedTarget, resources[ns] ?? {});
  }

  // Write merged target namespace
  if (Object.keys(mergedTarget).length > 0) {
    const targetOut = path.join(outLangDir, `${targetNs}.json`);
    await fsp.writeFile(targetOut, JSON.stringify(mergedTarget, null, 2), 'utf8');
    log('info', `wrote merged ${targetNs}.json for "${lang}" → ${targetOut}`, verbose);
  }

  // Copy remaining namespaces (those not merged) as-is
  await Promise.all(
    Object.entries(resources).map(async ([ns, data]) => {
      // Skip source namespaces (merged into target); a source file named after the
      // target would shadow the merge result, so it is skipped too.
      if (ns === targetNs) return;
      if (sourceNamespaces.has(ns)) return;

      const outFile = path.join(outLangDir, `${ns}.json`);
      await fsp.writeFile(outFile, JSON.stringify(data, null, 2), 'utf8');
      log('info', `copied ${lang}/${ns}.json → ${outFile}`, verbose);
    }),
  );
}

/**
 * Rebuild the whole cache from scratch. Wiping first prevents stale namespaces
 * (renamed/removed files or a changed merge target) from lingering in the cache.
 */
async function buildLocalesCache(options: Required<LocalesPluginOptions>): Promise<void> {
  const { srcDir, outDir, verbose } = options;

  if (!fs.existsSync(srcDir)) {
    log('warn', `source dir not found: ${srcDir}`, verbose);
    return;
  }

  await fsp.rm(outDir, { recursive: true, force: true });

  // Read all language directories, ignore hidden dirs
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  const langs = entries.filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name);

  await Promise.all(langs.map((lang) => syncLanguage(lang, options)));
}

/**
 * Serve the processed cache at /locales/{lng}/{ns}.json during dev, so the i18next
 * HTTP backend loads the same merged namespaces the build ships.
 */
function serveLocalesCache(server: ViteDevServer, options: Required<LocalesPluginOptions>): void {
  server.middlewares.use('/locales', (req, res, next) => {
    const url = (req.url ?? '').split('?')[0];
    // Only serve flat {lng}/{ns}.json paths; anything else falls through
    const match = /^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+\.json)$/.exec(url);
    if (!match) return next();

    const file = path.join(options.outDir, match[1], match[2]);
    fsp
      .readFile(file, 'utf8')
      .then((content) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(content);
      })
      .catch(() => next());
  });
}

/**
 * The single locales pipeline: merges source namespaces (common + app → c) into a
 * processed cache that is (1) served at /locales in dev, (2) emitted as build assets,
 * and (3) read by i18n Ally (see locales/README.md).
 *
 * Dev additionally watches locale assets and emits `i18next-hmr:update`; clients
 * listen for that event and reload i18next resources.
 */
export function localesPlugin(userOptions: LocalesPluginOptions = {}): Plugin {
  const options = resolveOptions(userOptions);
  let command: 'build' | 'serve' = 'serve';

  return {
    name: 'locales',
    enforce: 'post',

    config(_config, env) {
      command = env.command;
    },

    /** Rebuild the cache so emitted assets always reflect the current sources */
    async buildStart() {
      if (command !== 'build') return;
      await buildLocalesCache(options);
    },

    /** Emit the processed cache as locales/{lng}/{ns}.json build assets */
    async generateBundle() {
      const langs = fs.existsSync(options.outDir) ? await fsp.readdir(options.outDir, { withFileTypes: true }) : [];
      for (const lang of langs.filter((d) => d.isDirectory())) {
        const langDir = path.join(options.outDir, lang.name);
        const files = await fsp.readdir(langDir);
        for (const file of files.filter((f) => f.endsWith('.json'))) {
          this.emitFile({
            type: 'asset',
            fileName: `locales/${lang.name}/${file}`,
            source: await fsp.readFile(path.join(langDir, file), 'utf8'),
          });
        }
      }
    },

    /** Build initial cache when dev server starts and serve it at /locales */
    async configureServer(server) {
      await buildLocalesCache(options);
      serveLocalesCache(server, options);
    },

    /**
     * Handle locale file changes.
     * Returns nothing so Vite propagates the update through the module graph;
     * the HMR boundary in i18n-locales.ts handles bundled resources without full reload.
     */
    async handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | undefined> {
      if (!isLocaleAsset(ctx.file, options.srcDir)) return;

      log('info', `locale file changed: ${path.relative(options.srcDir, ctx.file)}`, options.verbose);

      // Sync only the affected language to the cache before notifying clients,
      // so their reload fetches the updated merged namespaces
      try {
        const rel = path.relative(options.srcDir, ctx.file);
        const [lang] = rel.split(path.sep);

        if (lang) {
          await syncLanguage(lang, options);
        }
      } catch (err) {
        log('error', 'failed to sync locale cache', options.verbose, err);
      }

      // Notify clients so i18next reloads HTTP-loaded resources
      ctx.server.ws.send({
        type: 'custom',
        event: CUSTOM_EVENT,
        data: { file: ctx.file },
      });
    },
  };
}
