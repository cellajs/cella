import { useRegisterSW } from 'virtual:pwa-register/react';
import { LoaderCircleIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';

const SW_UPDATE_INTERVAL = 15 * 60 * 1000;
const reloadToastId = 'reload-prompt';

/** Registers the service worker and, when a new version is waiting, shows a persistent toast to reload. */
export function ReloadPrompt() {
  const { t } = useTranslation();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.debug(`[ServiceWorker] Registered at: ${swUrl}`);
      if (!r) return;

      setInterval(() => {
        console.debug('[ServiceWorker] Periodic update check');
        r.update();
      }, SW_UPDATE_INTERVAL);

      const check = () => {
        if (document.visibilityState === 'visible') {
          console.debug('[ServiceWorker] Visibility/online update check');
          r.update();
        }
      };
      document.addEventListener('visibilitychange', check);
      window.addEventListener('online', check);
    },
    onRegisterError(error) {
      console.info('SW registration error', error);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;

    // In development, auto-reload on SW update (skip prompt during offline:watch)
    if (appConfig.mode === 'development') {
      updateServiceWorker(true);
      return;
    }

    const showPrompt = (reloading: boolean) =>
      toaster(t('c:refresh_pwa_app.text'), {
        id: reloadToastId,
        timeout: 0,
        onClose: () => setNeedRefresh(false),
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

    // The gap between click and reload is the new service worker's activate phase, so the
    // button spins until the page goes away. A hard reload follows if nothing happens in 5s.
    const reload = () => {
      showPrompt(true);
      setTimeout(() => window.location.reload(), 5000);
      updateServiceWorker(true);
    };

    // Reruns re-add under the same id, which updates the open toast in place
    showPrompt(false);
  }, [needRefresh, setNeedRefresh, updateServiceWorker, t]);

  return null;
}
