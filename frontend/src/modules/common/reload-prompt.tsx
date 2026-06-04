import { useRegisterSW } from 'virtual:pwa-register/react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Button } from '~/modules/ui/button';

// Periodic fallback interval (15 min) for SW update checks
const SW_UPDATE_INTERVAL = 15 * 60 * 1000;

export function ReloadPrompt() {
  const { t } = useTranslation();
  const [reloading, setReloading] = useState(false);

  // replaced dynamically
  const buildDate = '__DATE__';

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.debug(`[ServiceWorker] Registered at: ${swUrl}`);
      if (!r) return;

      // Periodic fallback check
      setInterval(() => {
        console.debug('[ServiceWorker] Periodic update check');
        r.update();
      }, SW_UPDATE_INTERVAL);

      // Immediate check when user returns to the tab or comes back online
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

  // In development, auto-reload on SW update (skip prompt during offline:watch)
  useEffect(() => {
    if (needRefresh && appConfig.mode === 'development') {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  // Attempt SW-driven reload, force a hard reload if nothing happens after 5s
  const reload = useCallback(() => {
    setReloading(true);
    // Guaranteed fallback: if the SW update doesn't trigger a reload, force one
    setTimeout(() => window.location.reload(), 5000);
    updateServiceWorker(true);
  }, [updateServiceWorker]);

  const close = () => {
    setNeedRefresh(false);
  };

  return (
    <>
      {needRefresh && (
        <div className="pointer-events-auto fixed right-0 bottom-0 z-200000 m-4 rounded-sm border bg-background p-3 text-left">
          <div className="mb-2">
            <span>{t('c:refresh_pwa_app.text')}</span>
          </div>
          <div className="space-x-2">
            {needRefresh && (
              <Button onClick={reload} loading={reloading}>
                {t('c:reload')}
              </Button>
            )}
            <Button variant="secondary" onClick={() => close()}>
              {t('c:close')}
            </Button>
          </div>
        </div>
      )}
      <div className="hidden">{buildDate}</div>
    </>
  );
}
