import type { ComponentType } from 'react';
import { alertsConfig } from '~/alert-config';
import { AlertBanner, type AlertContextMode } from '~/modules/common/alerter/alert-banner';

/** An entry of `alertsConfig`: a banner, or a component that decides itself whether and how it shows. */
type AppAlert = AlertBanner | { id: string; modes?: AlertContextMode[]; component: ComponentType };

export function Alerter({ mode }: { mode: AlertContextMode }) {
  // Widened here, so an app whose config lists banners alone keeps compiling
  const alerts: readonly AppAlert[] = alertsConfig;

  return (
    <>
      {alerts.map((alert) => {
        if (!alert.modes?.includes(mode)) return null;
        if ('component' in alert) return <alert.component key={alert.id} />;

        const { id, modes: _modes, children, ...alertProps } = alert;
        return (
          <AlertBanner key={id} id={id} contextMode={mode} {...alertProps}>
            {children}
          </AlertBanner>
        );
      })}
    </>
  );
}
