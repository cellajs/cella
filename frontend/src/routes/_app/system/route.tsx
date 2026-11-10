import { createFileRoute } from '@tanstack/react-router';
import { guardNavTabs } from '~/modules/common/page/tab-nav';
import { SystemPage } from '~/modules/system/system-page';
import { requireSystemAdmin } from '~/routes/-permission-guard';

export const Route = createFileRoute('/_app/system')({
  staticData: { floatingNavButtons: { left: 'menu' }, tabsSlot: 'system.tabs' },
  beforeLoad: ({ matches }) => {
    // The account-sheet link is isSystemAdmin-gated, but a direct URL must be too.
    requireSystemAdmin();
    // Landing tab derives from navTab order and app overrides, not a pinned path.
    guardNavTabs(matches, '/_app/system');
  },
  component: SystemPage,
});
