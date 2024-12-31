import { Outlet } from '@tanstack/react-router';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';

// Also in public routes, some components need to be initialized.
function PublicLayout() {
  return (
    <>
      <Dialoger />
      <Sheeter />
      <DropDowner />
      <Outlet />
    </>
  );
}

export { PublicLayout };
