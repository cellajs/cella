import { alertsConfig } from '~/alert-config';
import { AlertBanner, type AlertContextMode } from './alert-banner';
import { useAlertStore } from './alert-store';

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
