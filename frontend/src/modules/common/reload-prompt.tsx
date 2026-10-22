import { getSerwist } from 'virtual:serwist';
import type { Serwist } from '@serwist/window';
import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';

const swUpdateInterval = 15 * 60 * 1000;
const reloadToastId = 'reload-prompt';

/** Registers the service worker and, when a new version is waiting, shows a persistent toast to reload. */
export function ReloadPrompt() {
  const { t } = useTranslation();
  // The registered worker's handle once a new version waits; null while there is nothing to update.
  const [waiting, setWaiting] = useState<Serwist | null>(null);

  useEffect(() => {
    // The dev server serves no worker (main.tsx unregisters leftovers); a build without the PWA has none.
    if (!appConfig.has.pwa || import.meta.env.DEV) return;
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    void (async () => {
      const serwist = await getSerwist();
      if (!serwist || cancelled) return;
      serwist.addEventListener('waiting', () => setWaiting(serwist));
      const registration = await serwist.register().catch((error: unknown) => console.info('SW registration error', error));
      if (!registration || cancelled) return;
      console.debug('[ServiceWorker] Registered');

      const interval = setInterval(() => {
        console.debug('[ServiceWorker] Periodic update check');
        registration.update();
      }, swUpdateInterval);

      const check = () => {
        if (document.visibilityState === 'visible') {
          console.debug('[ServiceWorker] Visibility/online update check');
          registration.update();
        }
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
      cleanups.push(() => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('online', check);
      });
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  useEffect(() => {
    if (!waiting) return;

    // The waiting worker takes over on SKIP_WAITING (lib/sw.ts); the page reloads once it controls this tab.
    const activate = () => {
      waiting.addEventListener('controlling', () => window.location.reload());
      waiting.messageSkipWaiting();
    };

    // In development, auto-reload on SW update (skip prompt during offline:watch)
    if (appConfig.mode === 'development') {
      activate();
      return;
    }

    const showPrompt = (reloading: boolean) =>
      toaster(t('c:refresh_pwa_app.text'), {
        id: reloadToastId,
        timeout: 0,
        onClose: () => setWaiting(null),
        actionProps: {
          disabled: reloading,
          'aria-busy': reloading || undefined,
          onClick: reload,
          children: (
            <span className="relative inline-flex items-center">
              <span className={reloading ? 'invisible' : undefined}>{t('c:reload')}</span>
              {reloading && <LoaderCircleIcon className="absolute inset-0 m-auto animate-spin" />}
            </span>
          ),
        },
      });

    // The button spins through the new worker's activate phase; a hard reload follows if nothing happens in 5s
    const reload = () => {
      showPrompt(true);
      setTimeout(() => window.location.reload(), 5000);
      activate();
    };

    // Reruns re-add under the same id, which updates the open toast in place
    showPrompt(false);
  }, [waiting, t]);

  return null;
}
