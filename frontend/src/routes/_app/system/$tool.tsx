import { createFileRoute } from '@tanstack/react-router';
import { SystemToolComponent } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';
import { createErrorComponent } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';

/**
 * Host route for the system panel's registry tab tools (`system.tabs` slot), a non-entity tabbed
 * surface. Any tab id not matched by a static sibling route resolves here and renders the matching
 * registry tool, so modules and installed tools add system tabs without new route files.
 */
export const Route = createFileRoute('/_app/system/$tool')({
  staticData: { isAuth: true },
  beforeLoad: () => requireSystemAdmin(),
  head: () => ({ meta: [{ title: appTitle('System') }] }),
  component: SystemToolComponent,
  errorComponent: createErrorComponent('app'),
});
