import { useNavigate } from '@tanstack/react-router';
import { ArchiveIcon, ArrowRightIcon, ChevronsUpDownIcon, PlusIcon } from 'lucide-react';
import { type RefObject, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getMenuSection } from '~/lib/entity-modules';
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
import { closeNavSheet, showMenuOrganization } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { useOrganizationUnseenCounts } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
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
      <span className={cn('flex min-w-0 items-center gap-3', organization.membership.archived && 'text-muted-foreground')}>
        <EntityAvatar
          className={cn('size-6 shrink-0', organization.membership.archived && 'opacity-70')}
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

interface OrganizationSwitcherMenuProps {
  organization: UserMenuItem;
  /** The switcher row, which a dialog opened from the menu returns focus to. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/** The organization's page first, then every organization to swap the sheet to, and a way to create one. */
function OrganizationSwitcherMenu({ organization, triggerRef }: OrganizationSwitcherMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpointBelow('sm', false);
  const { active, archived } = useSwitcherOrganizations();
  const unseenCounts = useOrganizationUnseenCounts();
  const createOrganization = getMenuSection('organization')?.createAction;
  // Folds again with every opening, as the menu remounts; open from the start when the sheet shows an archived one
  const [showsArchived, setShowsArchived] = useState(organization.membership.archived);

  const openOrganizationPage = () => {
    if (!navigationStore.getState().keepNavOpen) closeNavSheet();
    const { to, params, search } = getChannelRoute(organization);
    navigate({ to, params, search, ...pageTopHashNav, resetScroll: false });
  };

  // The create dialog opens over the page, as a section's create button does, since a phone's menu would hide it
  const create = () => {
    if (isMobile) closeNavSheet();
    createOrganization?.(triggerRef);
  };

  const renderItem = (item: UserMenuItem) => (
    <SwitcherOrganizationItem key={item.id} organization={item} selected={item.id === organization.id} unseenCount={unseenCounts.get(item.id) ?? 0} />
  );

  return (
    <>
      <DropdownActionItem icon={ArrowRightIcon} onSelect={openOrganizationPage}>
        {t('c:go_to_organization_page')}
      </DropdownActionItem>
      <DropdownActionSeparator />
      {active.map(renderItem)}
      {archived.length > 0 && <DropdownActionSeparator />}
      {showsArchived
        ? archived.map(renderItem)
        : archived.length > 0 && (
            <DropdownActionItem icon={ArchiveIcon} closeOnSelect={false} onSelect={() => setShowsArchived(true)}>
              {t('c:show_archived')}
              <span className="ml-auto text-faint-foreground text-xs">{archived.length}</span>
            </DropdownActionItem>
          )}
      {createOrganization && (
        <>
          <DropdownActionSeparator />
          <DropdownActionItem icon={PlusIcon} onSelect={create}>
            {t('c:create_resource', { resource: t('c:organization') })}
          </DropdownActionItem>
        </>
      )}
    </>
  );
}

interface OrganizationSwitcherProps {
  organization: UserMenuItem;
}

/**
 * Heads the mobile menu sheet with the organization it shows: a row built like the channel rows under it, which opens
 * the switcher menu to reach the organization's page, pick another organization or create one.
 */
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
    dropdowner.getState().create(<OrganizationSwitcherMenu organization={organization} triggerRef={triggerRef} />, {
      id: 'organization-switcher',
      triggerId: 'organization-switcher',
      triggerRef,
      kind: 'menu',
      popupClassName: 'max-w-80',
    });
  };

  return (
    <div className="px-3 pt-2 pb-2">
      <Button
        ref={triggerRef}
        variant="ghost"
        onClick={openMenu}
        aria-label={t('c:switch_organization', { name: organization.name })}
        className="relative h-12 w-full justify-start gap-3 px-3 text-md data-dropdowner-active:bg-muted"
      >
        <EntityAvatar
          className="size-8 shrink-0"
          type={organization.entityType}
          id={organization.id}
          name={organization.name}
          url={organization.thumbnailUrl}
        />
        <span className="min-w-0 grow truncate text-left">{organization.name}</span>
        {unseenCount > 0 && <CountBadge count={unseenCount} className="shrink-0" />}
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        {/* On the corner, as on the nav buttons, so it reads as the other organizations' count and not this one's */}
        {otherUnseenCount > 0 && <CountBadge count={otherUnseenCount} className="absolute -top-1 -right-1" />}
      </Button>
    </div>
  );
}
