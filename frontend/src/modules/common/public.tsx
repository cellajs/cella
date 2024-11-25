import { Outlet } from '@tanstack/react-router';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';

function Public() {
  return (
    <>
      <Dialoger />
      <Sheeter />
      <DropDowner />
      <Outlet />
    </>
  );
}

export { Public };
