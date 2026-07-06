import { alertsConfig } from '~/alert-config';
import { AlertBanner, type AlertContextMode } from './alert-banner';

export function Alerter({ mode }: { mode: AlertContextMode }) {
  return (
    <>
      {alertsConfig.map(({ id, modes, children, ...alertProps }) => {
        if (!modes) return null;
        if (!modes.includes(mode)) return null;

        return (
          <AlertBanner key={id} id={id} modes={modes} contextMode={mode} {...alertProps}>
            {children}
          </AlertBanner>
        );
      })}
    </>
  );
}
