import { getMenuSection } from '~/lib/entity-modules';
import { CenteredPage } from '~/modules/common/page/centered-page';
import { PageSpinner } from '~/modules/common/spinner';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useOrganizationUnseenCounts } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NoOrganizationAlert } from '~/modules/organization/no-organization-alert';
import { useCurrentUser } from '~/modules/user/user-store';

/** The menu's organizations section on a page of its own, in the home page's column: the rail's last button opens it, as the rail has no room to create, hide or reorder them. */
export function OrganizationsPage() {
  const user = useCurrentUser();
  const { menu, isLoading } = useMenu(user.id);
  const unseenCounts = useOrganizationUnseenCounts(menu);
  const options = getMenuSection('organization');

  if (isLoading || !options) return <PageSpinner />;

  return (
    <CenteredPage className="container max-w-2xl">
      <MenuSheetSection
        options={options}
        items={menu.organization}
        isCollapsible={false}
        surface="page"
        emptyState={<NoOrganizationAlert />}
        rowCounts={unseenCounts}
      />
    </CenteredPage>
  );
}
