import { alertsConfig } from '~/alert-config';
import { type AlertContextMode, AlertWrap } from '~/modules/common/alert-wrap';
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
          <AlertWrap key={id} id={id} modes={modes} {...alertProps}>
            {children}
          </AlertWrap>
        );
      })}
    </>
  );
};

export default Alerter;
