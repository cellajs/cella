import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

const ReloadPrompt = () => {
  const { t } = useTranslation();

  // replaced dynamically
  const buildDate = '__DATE__';
  // replaced dynamically
  const reloadSW = '__RELOAD_SW__';

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.debug(`Service Worker at: ${swUrl}`);
      // @ts-expect-error just ignore
      if (reloadSW === 'true') {
        r &&
          setInterval(() => {
            console.info('Checking for sw update');
            r.update();
          }, 20000 /* 20s for testing purposes */);
      } else {
        console.debug('SW Registered');
      }
    },
    onRegisterError(error) {
      console.info('SW registration error', error);
    },
  });

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
            {needRefresh && <Button onClick={() => updateServiceWorker(true)}>{t('common:reload')}</Button>}
            <Button variant="secondary" onClick={() => close()}>
              {t('common:close')}
            </Button>
          </div>
        </div>
      )}
      <div className="hidden">{buildDate}</div>
    </>
  );
};

export default ReloadPrompt;
