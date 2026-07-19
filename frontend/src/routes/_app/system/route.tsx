import { createFileRoute } from '@tanstack/react-router';
import { SystemPage } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';
import { createErrorComponent } from '~/routes/-route-utils';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * System admin panel for platform-wide management.
 */
export const Route = createFileRoute('/_app/system')({
  staticData: { isAuth: true },
  beforeLoad: ({ matches }) => {
    // The account-sheet link is isSystemAdmin-gated, but a direct URL must be too.
    requireSystemAdmin();
    noDirectAccess(matches, '/_app/system', '/system/users');
  },
  component: SystemPage,
  errorComponent: createErrorComponent('app'),
});
