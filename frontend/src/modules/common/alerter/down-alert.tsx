import { t } from 'i18next';
import { ClockAlertIcon, CloudOffIcon, ConstructionIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { type AlertKeys, useAlertStore } from '~/modules/common/alerter/alert-store';
import { useUiOffline } from '~/modules/common/alerter/use-ui-offline';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useUIStore } from '~/modules/ui/ui-store';
import { forceOnline } from '~/query/offline/connectivity';

// Configuration for different down alerts
const downAlertConfig = {
  offline: {
    icon: CloudOffIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="c:offline" />,
    getContent: (dismissAlert: () => void) => {
      const offlineAccess = useUIStore.getState().offlineAccess;
      const i18nKey = offlineAccess ? 'c:offline_access.offline' : 'c:offline.text';
      const retry = () => {
        forceOnline();
        dismissAlert();
      };
      return (
        <Trans
          t={t}
          className="max-sm:hidden"
          i18nKey={i18nKey}
          components={{
            site_anchor: (
              <button type="button" className="font-semibold underline underline-offset-2" onClick={dismissAlert} />
            ),
            retry_anchor: (
              <button type="button" className="font-semibold underline underline-offset-2" onClick={retry} />
            ),
          }}
        />
      );
    },
    textKey: 'c:offline.text',
    variant: 'warning',
  },
  backend_not_ready: {
    icon: ClockAlertIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="c:backend_not_ready" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="c:backend_not_ready.text" />,
    variant: 'warning',
  },
  maintenance: {
    icon: ConstructionIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="c:maintenance_mode" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="c:maintenance_mode.text" />,
    variant: 'destructive',
  },
  auth_unavailable: {
    icon: TriangleAlertIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="c:auth_unavailable" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="c:auth_unavailable.text" />,
    variant: 'plain',
  },
} as const;

export const DownAlert = () => {
  const isOnline = useOnlineManager();
  const { downAlert, setDownAlert } = useAlertStore();
  const [dismissedAlerts, setDismissedAlerts] = useState<Partial<Record<AlertKeys, boolean>>>({});

  // Derives the debounced UI offline state from the logic state (onlineManager).
  useUiOffline();

  const dismissAlert = () => {
    if (!downAlert) return;
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  };

  // Allow the offline alert to surface again once connectivity returns.
  useEffect(() => {
    if (isOnline) setDismissedAlerts((prev) => ({ ...prev, offline: false }));
  }, [isOnline]);

  if (!downAlert || dismissedAlerts[downAlert] || !(downAlert in downAlertConfig)) return null; // Nothing to show
  const { getTitle, getContent, icon: Icon, variant } = downAlertConfig[downAlert];

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 justify-center max-sm:top-4 sm:bottom-4">
      <Alert variant={variant} onClose={dismissAlert} className="w-auto">
        <Icon />
        <AlertDescription className="pr-8">
          {getTitle()}
          <span className="mx-2">&#183;</span>
          {getContent(dismissAlert)}
        </AlertDescription>
      </Alert>
    </div>
  );
};
