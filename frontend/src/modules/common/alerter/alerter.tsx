import { alertsConfig } from '~/alert-config';
import { type AlertContextMode, MainAlert } from '~/modules/common/alerter';
import { useAlertStore } from '~/store/alert';

const Alerter = ({ mode }: { mode: AlertContextMode }) => {
  const { alertsSeen } = useAlertStore();

  return (
    <>
      {alertsConfig.map(({ id, modes, children, ...alertProps }) => {
        const showAlert = !alertsSeen.includes(id);
        if (!showAlert || !modes) return null;
        if (!modes.includes(mode)) return null;

        return (
          <MainAlert key={id} id={id} modes={modes} {...alertProps}>
            {children}
          </MainAlert>
        );
      })}
    </>
  );
};

export default Alerter;
