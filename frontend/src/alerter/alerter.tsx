import { AlertBanner, type AlertContextMode } from '~/alerter/alert-banner';
import { alertsConfig } from '~/alerter/alert-config';
import { useAlertStore } from '~/alerter/alert-store';

export function Alerter({ mode }: { mode: AlertContextMode }) {
  const { alertsSeen } = useAlertStore();

  return (
    <>
      {alertsConfig.map(({ id, modes, children, ...alertProps }) => {
        const showAlert = !alertsSeen.includes(id);
        if (!showAlert || !modes) return null;
        if (!modes.includes(mode)) return null;

        return (
          <AlertBanner key={id} id={id} modes={modes} {...alertProps}>
            {children}
          </AlertBanner>
        );
      })}
    </>
  );
}
