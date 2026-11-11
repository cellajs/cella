import { useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon, ChevronsUpDownIcon, EyeOffIcon, PlusIcon } from 'lucide-react';
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
import { menuColumnsClass, menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
import { menuOrganizations, openOrganizationLobby } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useOrganizationUnseenCounts } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { closeNavSheet, showMenuOrganization } from '~/modules/navigation/nav-sheet';
import { navigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';
import { getChannelRoute, pageTopHashNav } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

/** The organizations of the signed-in user's menu in display order, active and hidden apart, with their unseen counts. */
function useSwitcherOrganizations() {
  const user = useUserStore((state) => state.user);
  const { menu } = useMenu(user?.id);
  const organizations = menuOrganizations(menu);
  return {
    active: sortAndFilterMenu(organizations, 'active'),
    hidden: sortAndFilterMenu(organizations, 'hidden'),
    unseenCounts: useOrganizationUnseenCounts(menu),
  };
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
  const { active, hidden, unseenCounts } = useSwitcherOrganizations();
  const createOrganization = getMenuSection('organization')?.createAction;
  // Folds again with every opening, as the menu remounts; open from the start when the sheet shows a hidden one
  const [showsHidden, setShowsHidden] = useState(organization.membership.hidden);

  const openOrganizationPage = () => {
    if (!navigationStore.getState().keepNavOpen) closeNavSheet();
    navigate({ ...getChannelRoute(organization), ...pageTopHashNav, resetScroll: false });
  };

  // The create dialog opens over the page, as a section's create button does, since a phone's menu would hide it
  const create = () => {
    if (isMobile) closeNavSheet();
    createOrganization?.(triggerRef);
  };

  const renderItem = (item: UserMenuItem) => {
    const unseenCount = unseenCounts.get(item.id) ?? 0;
    return (
      <DropdownSelectItem
        key={item.id}
        selected={item.id === organization.id}
        onSelect={() => {
          showMenuOrganization(item);
          openOrganizationLobby(item);
        }}
      >
        <span className={cn('flex min-w-0 items-center gap-3', item.membership.hidden && 'text-muted-foreground')}>
          <EntityAvatar
            className={cn('size-6 shrink-0', item.membership.hidden && 'opacity-70')}
            type={item.entityType}
            id={item.id}
            name={item.name}
            url={item.thumbnailUrl}
          />
          <span className="truncate">{item.name}</span>
          {unseenCount > 0 && <CountBadge count={unseenCount} variant={item.membership.hidden ? 'muted' : 'primary'} className="ml-auto shrink-0" />}
        </span>
      </DropdownSelectItem>
    );
  };

  return (
    <>
      <DropdownActionItem icon={ArrowRightIcon} onSelect={openOrganizationPage}>
        {t('c:go_to_organization_page')}
      </DropdownActionItem>
      <DropdownActionSeparator />
      {active.map(renderItem)}
      {hidden.length > 0 && <DropdownActionSeparator />}
      {showsHidden
        ? hidden.map(renderItem)
        : hidden.length > 0 && (
            <DropdownActionItem icon={EyeOffIcon} closeOnSelect={false} onSelect={() => setShowsHidden(true)}>
              {t('c:show_hidden')}
              <span className="text-faint-foreground ml-auto text-xs">{hidden.length}</span>
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

/** Heads the mobile menu sheet: a row like the channel rows under it, which opens the organization switcher menu. */
export function OrganizationSwitcher({ organization }: { organization: UserMenuItem }) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { active, unseenCounts } = useSwitcherOrganizations();
  // This sheet shows its own organization's counts; nothing else tells of new content in the others
  const hasUnseenElsewhere = active.some(({ id }) => id !== organization.id && unseenCounts.has(id));

  const openMenu = () => {
    dropdowner.getState().create(<OrganizationSwitcherMenu organization={organization} triggerRef={triggerRef} />, {
      id: 'organization-switcher',
      triggerId: 'organization-switcher',
      triggerRef,
      kind: 'menu',
      popupClassName: 'max-w-80',
    });
  };

  // The menu sheet header above draws the line on top
  return (
    <>
      <div className="px-3 py-1.5">
        <Button
          ref={triggerRef}
          variant="ghost"
          onClick={openMenu}
          aria-label={t(hasUnseenElsewhere ? 'c:switch_organization_unseen' : 'c:switch_organization', { name: organization.name })}
          className={cn('text-md data-dropdowner-active:bg-muted h-12 w-full justify-start border-0', menuColumnsClass)}
        >
          <EntityAvatar
            className="size-8 shrink-0"
            type={organization.entityType}
            id={organization.id}
            name={organization.name}
            url={organization.thumbnailUrl}
          />
          <span className="min-w-0 grow truncate text-left">{organization.name}</span>
          {hasUnseenElsewhere && <span className="bg-primary -mr-2 size-2 shrink-0 rounded-full" />}
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </div>
      <div className={menuHairlineClass} />
    </>
  );
}
