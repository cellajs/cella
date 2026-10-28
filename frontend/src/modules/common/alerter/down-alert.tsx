import { CloudOffIcon, ConstructionIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { type AlertKey, useAlertStore } from '~/modules/common/alerter/alert-store';
import { useOfflineAlert } from '~/modules/common/alerter/use-offline-alert';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { recheckNow } from '~/query/offline/connectivity';

const downAlertConfig = {
  offline: { icon: CloudOffIcon, titleKey: 'c:offline', textKey: 'c:offline.alert', variant: 'warning' },
  maintenance: { icon: ConstructionIcon, titleKey: 'c:maintenance_mode', textKey: 'c:maintenance_mode.text', variant: 'destructive' },
  auth_unavailable: { icon: TriangleAlertIcon, titleKey: 'c:auth_unavailable', textKey: 'c:auth_unavailable.text', variant: 'plain' },
} as const;

/** The server's down alert, else the offline alert; a server alert the user dismissed stays hidden while the layout is mounted. */
export function DownAlert() {
  const { t } = useTranslation();
  const serverAlert = useAlertStore((state) => state.downAlert);
  const setDownAlert = useAlertStore((state) => state.setDownAlert);
  const [dismissedAlerts, setDismissedAlerts] = useState<Partial<Record<AlertKey, boolean>>>({});
  const offlineAlert = useOfflineAlert();

  const shownServerAlert = serverAlert && !dismissedAlerts[serverAlert] ? serverAlert : null;
  const downAlert = shownServerAlert ?? (offlineAlert.isShown ? 'offline' : null);

  const dismissAlert = () => {
    if (!shownServerAlert) return offlineAlert.dismiss();
    setDismissedAlerts((prev) => ({ ...prev, [shownServerAlert]: true }));
    setDownAlert(null);
  };

  if (!downAlert) return null;
  const { icon: Icon, titleKey, textKey, variant } = downAlertConfig[downAlert];

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
              retry_anchor: <button type="button" className="link-inline font-semibold" onClick={() => void recheckNow()} />,
            }}
          />
        </AlertDescription>
      </Alert>
    </div>
  );
}
