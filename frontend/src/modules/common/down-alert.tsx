import { AlertTriangle, ClockAlert, CloudOff, Construction, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';
import { useUIStore } from '~/store/ui';

export const downAlertConfig = {
  offline: {
    icon: CloudOff,
    titleKey: 'common:offline',
    textKey: 'common:offline.text',
    variant: 'destructive',
  },
  backend_not_ready: {
    icon: ClockAlert,
    titleKey: 'common:backend_not_ready',
    textKey: 'common:backend_not_ready.text',
    variant: 'warning',
  },
  maintenance: {
    icon: Construction,
    titleKey: 'common:maintenance_mode',
    textKey: 'common:maintenance_mode.text',
    variant: 'destructive',
  },
  auth_unavailable: {
    icon: AlertTriangle,
    titleKey: 'common:auth_unavailable',
    textKey: 'common:auth_unavailable.text',
    variant: 'plain',
  },
} as const;

export const DownAlert = () => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { offlineAccess } = useUIStore();
  const { downAlert, setDownAlert } = useAlertStore();

  // Track if user manually dismissed alert
  const [hasDismissed, setHasDismissed] = useState(false);

  const dissmissAlert = () => {
    setHasDismissed(true);
    setDownAlert(null);
  };

  // Based on network status manages "offline" alert
  useEffect(() => {
    // Remove offline alert when user is back online
    if (isOnline && downAlert === 'offline') setDownAlert(null);

    // Show offline alert only if user hasn't dismissed it manually
    if (!isOnline && !hasDismissed) setDownAlert('offline');

    // Reset dismissal flag when effect re-runs
    return () => setHasDismissed(false);
  }, [downAlert, isOnline]);

  if (!downAlert) return null; // Nothing to show
  const { titleKey, textKey, icon: Icon, variant } = downAlertConfig[downAlert];

  // Determine i18n key and dynamic components for <Trans />
  const isOffline = downAlert === 'offline' && offlineAccess;
  const transProps = isOffline
    ? {
        i18nKey: 'common:offline_access.offline',
        components: { site_anchor: <button type="button" className="underline" onClick={dissmissAlert} /> },
      }
    : { i18nKey: textKey };

  return (
    <div className="fixed z-2000 pointer-events-auto max-sm:bottom-20 bottom-4 left-4 right-4 border-0 justify-center">
      <Alert variant={variant} className="border-0 w-auto">
        {/* Dismiss Button */}
        <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={dissmissAlert}>
          <X size={16} />
        </Button>

        <Icon size={16} />
        <AlertDescription className="pr-8 font-light">
          <strong>{t(titleKey)}</strong>
          <span className="mx-2">&#183;</span>
          <Trans t={t} {...transProps} />

          {/* Mobile "continue" button */}
          <button type="button" className="inline-block sm:hidden font-semibold" onClick={dissmissAlert}>
            {t('common:continue')}
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
};

// const devAlert = useRef(env.VITE_DEV_ALERT);

/**
  //  * Second effect: Handle special "backend_not_ready" alert in development mode.
  //  * This is triggered by VITE_DEV_ALERT and runs a delayed health check to simulate backend recovery.
  //  */
// useEffect(() => {
//   // If backend_not_ready alert is showing, but we lose connection, reset alert
//   if (!isOnline && downAlert === 'backend_not_ready') {
//     cancelAlert();
//     return;
//   }

//   // Only run this logic in development when devAlert is true and we’re online
//   if (process.env.NODE_ENV !== 'development' || !devAlert.current || !isOnline) return;

//   // Manually trigger the backend_not_ready alert
//   useAlertStore.getState().setDownAlert('backend_not_ready');

//   const controller = new AbortController();

//   (async () => {
//     if (downAlert === 'backend_not_ready') {
//       // Wait 5s before checking backend again
//       const isBackendResponsive = await healthCheck({
//         url,
//         initDelay: 5000,
//         factor: 1,
//         signal: controller.signal,
//       });

//       if (isBackendResponsive && !controller.signal.aborted) {
//         // Backend is up again, dismiss alert and disable dev alert trigger
//         devAlert.current = false;
//         setDownAlert(null);
//       }
//     }
//   })();

//   return () => controller.abort(); // Cleanup any pending health check
// }, [isOnline, downAlert]);
