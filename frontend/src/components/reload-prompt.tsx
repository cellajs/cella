import { Button } from './ui/button';
import { useRegisterSW } from 'virtual:pwa-register/react';

function ReloadPrompt() {
  // replaced dynamically
  const buildDate = '__DATE__';
  // replaced dynamically
  const reloadSW = '__RELOAD_SW__';

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      console.log(`Service Worker at: ${swUrl}`);
      // @ts-expect-error just ignore
      if (reloadSW === 'true') {
        r &&
          setInterval(() => {
            console.log('Checking for sw update');
            r.update();
          }, 20000 /* 20s for testing purposes */);
      } else {
        // eslint-disable-next-line prefer-template
        console.log(`SW Registered: ${r}`);
      }
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div>
      {(offlineReady || needRefresh) && (
        <div className="fixed right-0 bottom-0 m-[16px] p-[12px] border rounded-[4px] z-[200] text-left bg-background">
          <div className="mb-[8px]">
            {offlineReady ? <span>App ready to work offline</span> : <span>New content available, click on reload button to update.</span>}
          </div>
          <div className="space-x-[8px]">
            {needRefresh && <Button onClick={() => updateServiceWorker(true)}>Reload</Button>}
            <Button variant="secondary" onClick={() => close()}>
              Close
            </Button>
          </div>
        </div>
      )}
      <div className="hidden">{buildDate}</div>
    </div>
  );
}

export { ReloadPrompt };
