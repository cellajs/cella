import { createFileRoute } from '@tanstack/react-router';
import { SystemToolComponent } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';
import { createErrorComponent } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

/** Any `system.tabs` id without a static sibling route resolves here and renders the matching registry tool. */
export const Route = createFileRoute('/_app/system/$tool')({
  staticData: { isAuth: true },
  beforeLoad: () => requireSystemAdmin(),
  head: () => ({ meta: [{ title: appTitle('System') }] }),
  component: SystemToolComponent,
  errorComponent: createErrorComponent('app'),
});
