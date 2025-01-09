import { Outlet } from '@tanstack/react-router';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';
import Alerter from './alerter/alerter';

// Also in public routes, some components need to be initialized.
function PublicLayout() {
  return (
    <>
      <Alerter mode="public" />
      <Dialoger />
      <Sheeter />
      <DropDowner />
      <Outlet />
    </>
  );
}

export { PublicLayout };
