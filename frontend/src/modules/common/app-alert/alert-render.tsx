import { AppAlert } from '~/modules/common/app-alert';
import { alertsConfig } from '~/modules/common/app-alert/alert-config';
import { useAlertStore } from '~/store/alert';

const AlertRenderer = () => {
  const { alertsSeen } = useAlertStore();

  return (
    <>
      {alertsConfig.map((alert) => {
        const showAlert = !alertsSeen.includes(alert.id);

        if (!showAlert) return null;

        return (
          <AppAlert key={alert.id} id={alert.id} Icon={alert.Icon} title={alert.title} className={alert.className} variant={alert.variant}>
            {alert.children}
          </AppAlert>
        );
      })}
    </>
  );
};

export default AlertRenderer;
