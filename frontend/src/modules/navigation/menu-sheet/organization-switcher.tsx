import { ChevronsUpDownIcon, MenuIcon } from 'lucide-react';
import { useRef } from 'react';
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
import { showMenuOrganization } from '~/modules/navigation/nav-sheet';
import { useOrganizationUnseenCounts } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

/** The active organizations of the signed-in user's menu, in display order. */
function useActiveOrganizations() {
  const user = useUserStore((state) => state.user);
  const { menu } = useMenu(user?.id);
  return sortAndFilterMenu(menuOrganizations(menu), false);
}

interface SwitcherOrganizationItemProps {
  organization: UserMenuItem;
  selected: boolean;
  unseenCount: number;
}

function SwitcherOrganizationItem({ organization, selected, unseenCount }: SwitcherOrganizationItemProps) {
  return (
    <DropdownSelectItem selected={selected} onSelect={() => showMenuOrganization(organization)}>
      <span className="flex min-w-0 items-center gap-3">
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
  /** Turns the menu sheet to the full menu, which creates organizations and holds the archived ones. */
  onShowMenu: () => void;
}

function OrganizationSwitcherMenu({ organization, onShowMenu }: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const active = useActiveOrganizations();
  const unseenCounts = useOrganizationUnseenCounts();

  return (
    <>
      {active.map((item) => (
        <SwitcherOrganizationItem
          key={item.id}
          organization={item}
          selected={item.id === organization.id}
          unseenCount={unseenCounts.get(item.id) ?? 0}
        />
      ))}
      <DropdownActionSeparator />
      <DropdownActionItem icon={MenuIcon} onSelect={onShowMenu}>
        {t('c:menu')}
      </DropdownActionItem>
    </>
  );
}

/** Heads the mobile menu sheet with the organization it shows; picking another swaps the sheet to that one. */
export function OrganizationSwitcher({ organization, onShowMenu }: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = useActiveOrganizations();
  const unseenCounts = useOrganizationUnseenCounts();

  // Unseen news elsewhere, the reason to switch
  let otherUnseenCount = 0;
  for (const item of active) if (item.id !== organization.id) otherUnseenCount += unseenCounts.get(item.id) ?? 0;

  const openMenu = () => {
    dropdowner.getState().create(<OrganizationSwitcherMenu organization={organization} onShowMenu={onShowMenu} />, {
      id: 'organization-switcher',
      triggerId: 'organization-switcher',
      triggerRef,
      kind: 'menu',
    });
  };

  return (
    <div className="px-3 pt-3 pb-2">
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={openMenu}
        aria-label={t('c:switch_organization', { name: organization.name })}
        className="relative h-14 w-full justify-start gap-3 px-3 data-dropdowner-active:bg-accent"
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
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        {/* On the corner, as on the nav buttons, so it reads as the other organizations' count and not this one's */}
        {otherUnseenCount > 0 && <CountBadge count={otherUnseenCount} className="absolute -top-2 -right-2" />}
      </Button>
    </div>
  );
}
