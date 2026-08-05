import { createFileRoute } from '@tanstack/react-router';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { SystemPage } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';
import { createErrorComponent } from '~/routes/-route-utils';

/**
 * System admin panel for platform-wide management.
 */
export const Route = createFileRoute('/_app/system')({
  staticData: { isAuth: true, tabsSlot: 'system.tabs' },
  beforeLoad: ({ matches }) => {
    // The account-sheet link is isSystemAdmin-gated, but a direct URL must be too.
    requireSystemAdmin();
    // Landing tab derives from navTab order and app overrides, not a pinned path; the guard also
    // forwards navigations aimed at a tab an app override disables.
    guardNavTabs(matches, '/_app/system');
  },
  component: SystemPage,
  errorComponent: createErrorComponent('app'),
});
