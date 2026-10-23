import { alertsConfig } from '~/alert-config';
import { AlertBanner, type AlertContextMode } from '~/modules/common/alerter/alert-banner';

interface AlerterProps {
  mode: AlertContextMode;
}

export function Alerter({ mode }: AlerterProps) {
  return (
    <>
      {alertsConfig.map(({ id, modes, children, ...alertProps }) => {
        if (!modes?.includes(mode)) return null;

        return (
          <AlertBanner key={id} id={id} contextMode={mode} {...alertProps}>
            {children}
          </AlertBanner>
        );
      })}
    </>
  );
}
