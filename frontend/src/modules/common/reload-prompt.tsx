import { useRegisterSW } from 'virtual:pwa-register/react';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Button } from '~/modules/ui/button';

export function ReloadPrompt() {
  const { t } = useTranslation();

  // replaced dynamically
  const buildDate = '__DATE__';
  // replaced dynamically
  const reloadSW: string = '__RELOAD_SW__';

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.debug(`[ServiceWorker] Registered at: ${swUrl}`);
      if (reloadSW === 'true') {
        r &&
          setInterval(() => {
            console.info('Checking for sw update');
            r.update();
          }, 20000 /* 20s for testing purposes */);
      } else {
        console.debug('[ServiceWorker] Registered');
      }
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

  // Attempt SW-driven reload, fall back to hard reload after timeout
  const reload = useCallback(() => {
    const timeout = setTimeout(() => window.location.reload(), 3000);
    updateServiceWorker(true).then(() => clearTimeout(timeout));
  }, [updateServiceWorker]);

  const close = () => {
    setNeedRefresh(false);
  };

  return (
    <>
      {needRefresh && (
        <div className="fixed right-0 bottom-0 m-4 p-3 border rounded-sm z-200000 pointer-events-auto text-left bg-background">
          <div className="mb-2">
            <span>{t('common:refresh_pwa_app.text')}</span>
          </div>
          <div className="space-x-2">
            {needRefresh && <Button onClick={reload}>{t('common:reload')}</Button>}
            <Button variant="secondary" onClick={() => close()}>
              {t('common:close')}
            </Button>
          </div>
        </div>
      )}
      <div className="hidden">{buildDate}</div>
    </>
  );
}
