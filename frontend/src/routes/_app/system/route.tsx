import { createFileRoute } from '@tanstack/react-router';
import { defaultNavTabPath } from '~/modules/common/page/tab-nav';
import { SystemPage } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';
import { createErrorComponent } from '~/routes/-route-utils';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * System admin panel for platform-wide management.
 */
export const Route = createFileRoute('/_app/system')({
  staticData: { isAuth: true, tabsSlot: 'system.tabs' },
  beforeLoad: ({ matches }) => {
    // The account-sheet link is isSystemAdmin-gated, but a direct URL must be too.
    requireSystemAdmin();
    // Default tab derives from navTab order and app overrides, not a pinned path
    const defaultTab = defaultNavTabPath('/_app/system');
    if (defaultTab) noDirectAccess(matches, '/_app/system', defaultTab);
  },
  component: SystemPage,
  errorComponent: createErrorComponent('app'),
});
