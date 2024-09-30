import { alertsConfig } from '~/alert-config';
import { MainAlert } from '~/modules/common/main-alert';
import { useAlertStore } from '~/store/alert';

const AlertRenderer = () => {
  const { alertsSeen } = useAlertStore();

  return (
    <>
      {alertsConfig.map((alert) => {
        const showAlert = !alertsSeen.includes(alert.id);

        if (!showAlert) return null;

        return (
          <MainAlert key={alert.id} id={alert.id} Icon={alert.Icon} title={alert.title} className={alert.className} variant={alert.variant}>
            {alert.children}
          </MainAlert>
        );
      })}
    </>
  );
};

export default AlertRenderer;
