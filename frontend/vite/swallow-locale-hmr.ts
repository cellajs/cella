import path from 'node:path';
import type { HmrContext, ModuleNode, Plugin } from 'vite';

const CUSTOM_EVENT = 'i18next-hmr:update' as const;

function isLocaleAsset(file: string): boolean {
  // Normalize to POSIX style so the regex is reliable on Windows/macOS/Linux
  const posix = file.split(path.sep).join(path.posix.sep);
  // Match .../locales/<any>/<any>.(json|yml|yaml)
  return /(?:^|\/)locales\/.+\.(?:json|ya?ml)$/i.test(posix);
}

/**
 * A Vite plugin that swallows HMR updates for text changes in translation/locale files to prevent full page reloads.
 */
export function swallowLocaleHMR(): Plugin {
  return {
    name: 'prevent-full-reload-for-locales',
    apply: 'serve',
    enforce: 'post',
    handleHotUpdate(ctx: HmrContext): ModuleNode[] | void | Promise<ModuleNode[] | void> {
      // Log for visibility (kept as a dev aid)
      // You can narrow/format this further if you like
      // eslint-disable-next-line no-console
      console.log('HMR: File changed:', ctx.file);

      if (isLocaleAsset(ctx.file)) {
        // Tell the client (i18next-hmr) about the file that changed
        ctx.server.ws.send({
          type: 'custom',
          event: CUSTOM_EVENT,
          data: { file: ctx.file },
        });

        console.log('HMR: Locale file changed, prevent reloading', ctx.file);

        // Returning an empty list claims the update and prevents full reload.
        // This matches the expected handleHotUpdate return type.
        return [];
      }
      // fallthrough: let Vite handle other files normally
    },
  };
}
