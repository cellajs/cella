import { Link } from '@tanstack/react-router';
import { ArchiveIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '~/modules/common/count-badge';
import { DropdownActionItem, DropdownActionSeparator } from '~/modules/common/dropdowner/dropdown-action-item';
import { DropdownSelectItem } from '~/modules/common/dropdowner/dropdown-select-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { UserMenuItem } from '~/modules/me/types';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { showMenuOrganization } from '~/modules/navigation/nav-sheet';
import { useOrganizationUnseenCounts } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';
import { useUserStore } from '~/modules/user/user-store';
import { getChannelRoute } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

/** The organizations of the signed-in user's menu in display order, active and archived apart. */
function useSwitcherOrganizations() {
  const user = useUserStore((state) => state.user);
  const { menu } = useMenu(user?.id);
  const organizations = menuOrganizations(menu);
  return { active: sortAndFilterMenu(organizations, false), archived: sortAndFilterMenu(organizations, true) };
}

interface SwitcherOrganizationItemProps {
  organization: UserMenuItem;
  selected: boolean;
  unseenCount: number;
}

function SwitcherOrganizationItem({ organization, selected, unseenCount }: SwitcherOrganizationItemProps) {
  return (
    <DropdownSelectItem selected={selected} onSelect={() => showMenuOrganization(organization)}>
      <span className={cn('flex min-w-0 items-center gap-3', organization.membership.archived && 'opacity-70')}>
        <EntityAvatar
          className="size-6 shrink-0"
          type={organization.entityType}
          id={organization.id}
          name={organization.name}
          url={organization.thumbnailUrl}
        />
        <span className="truncate">{organization.name}</span>
        {unseenCount > 0 && <CountBadge count={unseenCount} className="shrink-0" />}
      </span>
    </DropdownSelectItem>
  );
}

interface OrganizationSwitcherProps {
  organization: UserMenuItem;
}

function OrganizationSwitcherMenu({ organization }: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const { active, archived } = useSwitcherOrganizations();
  const unseenCounts = useOrganizationUnseenCounts();
  // Folds again with every opening, as the menu remounts; open from the start when the sheet shows an archived one
  const [showsArchived, setShowsArchived] = useState(organization.membership.archived);

  const renderItem = (item: UserMenuItem) => (
    <SwitcherOrganizationItem key={item.id} organization={item} selected={item.id === organization.id} unseenCount={unseenCounts.get(item.id) ?? 0} />
  );

  return (
    <>
      {active.map(renderItem)}
      {archived.length > 0 && <DropdownActionSeparator />}
      {showsArchived
        ? archived.map(renderItem)
        : archived.length > 0 && (
            <DropdownActionItem icon={ArchiveIcon} closeOnSelect={false} onSelect={() => setShowsArchived(true)}>
              {t('c:show_archived')}
              <span className="ml-auto text-muted-foreground text-xs">{archived.length}</span>
            </DropdownActionItem>
          )}
    </>
  );
}

/** Heads the mobile menu sheet with the organization it shows: a link to its page, and a toggle that picks another to swap the sheet to. */
export function OrganizationSwitcher({ organization }: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { active } = useSwitcherOrganizations();
  const unseenCounts = useOrganizationUnseenCounts();
  // Unseen content homed in the organization itself, as the desktop menu header shows it
  const unseenCount = useMenuItemUnseenCount(organization, true);

  // Unseen news elsewhere, the reason to switch
  let otherUnseenCount = 0;
  for (const item of active) if (item.id !== organization.id) otherUnseenCount += unseenCounts.get(item.id) ?? 0;

  const openMenu = () => {
    dropdowner.getState().create(<OrganizationSwitcherMenu organization={organization} />, {
      id: 'organization-switcher',
      triggerId: 'organization-switcher',
      triggerRef,
      kind: 'menu',
    });
  };

  return (
    <div className="px-3 pt-2 pb-2">
      <ButtonGroup className="w-full">
        <Button
          variant="outline"
          render={<Link {...getChannelRoute(organization)} draggable={false} />}
          className="h-14 min-w-0 grow justify-start gap-3 px-3"
        >
          <EntityAvatar
            className="size-9 shrink-0"
            type={organization.entityType}
            id={organization.id}
            name={organization.name}
            url={organization.thumbnailUrl}
          />
          <span className="flex min-w-0 grow flex-col text-left">
            <span className="truncate">{organization.name}</span>
            <span className="truncate font-normal text-muted-foreground text-xs">{t(organization.membership.role)}</span>
          </span>
          {unseenCount > 0 && <CountBadge count={unseenCount} className="shrink-0" />}
        </Button>
        <Button
          ref={triggerRef}
          variant="outline"
          onClick={openMenu}
          aria-label={t('c:switch_organization', { name: organization.name })}
          className="relative h-14 w-12 shrink-0 data-dropdowner-active:bg-accent"
        >
          <ChevronsUpDownIcon className="size-4 opacity-50" />
          {/* On the corner, as on the nav buttons, so it reads as the other organizations' count and not this one's */}
          {otherUnseenCount > 0 && <CountBadge count={otherUnseenCount} className="absolute -top-2 -right-2" />}
        </Button>
      </ButtonGroup>
    </div>
  );
}
