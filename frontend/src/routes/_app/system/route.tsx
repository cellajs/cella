import { createFileRoute } from '@tanstack/react-router';
import { SystemPage } from '~/modules/system/system-page';
import { createErrorComponent } from '~/routes/-route-utils';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * System admin panel for platform-wide management.
 */
export const Route = createFileRoute('/_app/system')({
  staticData: { isAuth: true },
  beforeLoad: ({ matches }) => {
    noDirectAccess(matches, '/_app/system', '/system/users');
  },
  component: SystemPage,
  errorComponent: createErrorComponent('app'),
});
