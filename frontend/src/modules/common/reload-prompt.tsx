import { getSerwist } from 'virtual:serwist';
import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { reloadApp } from '~/utils/app-update';

const swUpdateInterval = 15 * 60 * 1000;
const reloadToastId = 'reload-prompt';

/** Registers the service worker and, when a new version is waiting, shows a persistent toast to reload. */
export function ReloadPrompt() {
  const { t } = useTranslation();
  // True once a new version is installed and waits to take over
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    // The dev server serves no worker (main.tsx unregisters leftovers); a build without the PWA has none.
    if (!appConfig.has.pwa || import.meta.env.DEV) return;
    const cleanups: (() => void)[] = [];
    let cancelled = false;

    void (async () => {
      const serwist = await getSerwist();
      if (!serwist || cancelled) return;
      serwist.addEventListener('waiting', () => setWaiting(true));
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

    // In development, auto-reload on SW update (skip prompt during offline:watch)
    if (appConfig.mode === 'development') {
      void reloadApp();
      return;
    }

    const showPrompt = (reloading: boolean) =>
      toaster(t('c:refresh_pwa_app.text'), {
        id: reloadToastId,
        timeout: 0,
        onClose: () => setWaiting(false),
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

    // The button spins through the new worker's activate phase
    const reload = () => {
      showPrompt(true);
      void reloadApp();
    };

    // Reruns re-add under the same id, which updates the open toast in place
    showPrompt(false);
  }, [waiting, t]);

  return null;
}
