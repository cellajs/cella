import { Outlet } from '@tanstack/react-router';
import { Sheeter } from '~/modules/common/sheeter';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';

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
