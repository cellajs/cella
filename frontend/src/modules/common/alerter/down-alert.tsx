import { ClockAlertIcon, CloudOffIcon, ConstructionIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { type AlertKey, useAlertStore } from '~/modules/common/alerter/alert-store';
import { useUIOffline } from '~/modules/common/alerter/use-ui-offline';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useUIStore } from '~/modules/ui/ui-store';
import { forceOnline } from '~/query/offline/connectivity';

/** Each alert's text is its title key plus `.text`, apart from the offline text under offline access. */
const downAlertConfig = {
  offline: { icon: CloudOffIcon, titleKey: 'c:offline', variant: 'warning' },
  backend_not_ready: { icon: ClockAlertIcon, titleKey: 'c:backend_not_ready', variant: 'warning' },
  maintenance: { icon: ConstructionIcon, titleKey: 'c:maintenance_mode', variant: 'destructive' },
  auth_unavailable: { icon: TriangleAlertIcon, titleKey: 'c:auth_unavailable', variant: 'plain' },
} as const;

export function DownAlert() {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const offlineAccess = useUIStore((state) => state.offlineAccess);
  const downAlert = useAlertStore((state) => state.downAlert);
  const setDownAlert = useAlertStore((state) => state.setDownAlert);
  const [dismissedAlerts, setDismissedAlerts] = useState<Partial<Record<AlertKey, boolean>>>({});

  useUIOffline();

  const dismissAlert = () => {
    if (!downAlert) return;
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  };

  const retry = () => {
    forceOnline();
    dismissAlert();
  };

  // Returning connectivity re-arms the offline alert
  useEffect(() => {
    if (isOnline) setDismissedAlerts((prev) => ({ ...prev, offline: false }));
  }, [isOnline]);

  if (!downAlert || dismissedAlerts[downAlert] || !(downAlert in downAlertConfig)) return null;
  const { icon: Icon, titleKey, variant } = downAlertConfig[downAlert];
  const textKey = downAlert === 'offline' && offlineAccess ? 'c:offline_access.offline' : (`${titleKey}.text` as const);

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 max-sm:top-4 sm:bottom-4">
      <Alert variant={variant} onClose={dismissAlert}>
        <Icon />
        <AlertDescription>
          <span className="font-bold">{t(titleKey)}</span>
          <span className="mx-2">&#183;</span>
          <Trans
            t={t}
            i18nKey={textKey}
            components={{
              site_anchor: <button type="button" className="link-inline font-semibold" onClick={dismissAlert} />,
              retry_anchor: <button type="button" className="link-inline font-semibold" onClick={retry} />,
            }}
          />
        </AlertDescription>
      </Alert>
    </div>
  );
}
