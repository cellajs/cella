import { Outlet } from '@tanstack/react-router';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';
import AlertRenderer from './main-alert/alert-render';

// Also in public routes, some components need to be initialized.
function PublicLayout() {
  return (
    <>
      <AlertRenderer />
      <Dialoger />
      <Sheeter />
      <DropDowner />
      <Outlet />
    </>
  );
}

export { PublicLayout };
