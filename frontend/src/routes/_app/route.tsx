import { createFileRoute } from '@tanstack/react-router';
import { AppLayout } from '~/modules/common/app/app-layout';
import { appLayoutBeforeLoad, appLayoutLoader } from '~/modules/common/app/route-logic';
import { withSuspenseSpinner } from '~/modules/common/with-suspense';

/** Every page below needs a session: `appLayoutBeforeLoad` is the sign-in gate. */
export const Route = createFileRoute('/_app')({
  staticData: { boundary: 'app' },
  beforeLoad: appLayoutBeforeLoad,
  loader: ({ cause }) => appLayoutLoader(cause),
  component: withSuspenseSpinner(AppLayout),
});
