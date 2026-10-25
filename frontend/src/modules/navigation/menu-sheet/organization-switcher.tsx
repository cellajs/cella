import { onlineManager } from '@tanstack/react-query';
import { ArchiveIcon, ChevronLeftIcon, ChevronRightIcon, ChevronsUpDownIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getMenuSection } from '~/lib/entity-modules';
import { CountBadge } from '~/modules/common/count-badge';
import { DropdownActionItem, DropdownActionSeparator } from '~/modules/common/dropdowner/dropdown-action-item';
import { DropdownSelectItem } from '~/modules/common/dropdowner/dropdown-select-item';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { collectChannelIds } from '~/modules/navigation/menu-sheet/helpers/collect-channel-ids';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { closeNavSheet, showMenuOrganization } from '~/modules/navigation/nav-sheet';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { uiStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';

/** The organizations of the signed-in user's menu, split by archive state, each in display order. */
function useSwitcherOrganizations() {
  const user = useUserStore((state) => state.user);
  const { menu } = useMenu(user?.id);
  const organizations = menuOrganizations(menu);

  return { active: sortAndFilterMenu(organizations, false), archived: sortAndFilterMenu(organizations, true) };
}

interface SwitcherOrganizationItemProps {
  organization: UserMenuItem;
  selected: boolean;
}

function SwitcherOrganizationItem({ organization, selected }: SwitcherOrganizationItemProps) {
  const { t } = useTranslation();
  const unseenCount = useMenuItemUnseenCount(organization, false);

  // An archived organization is not kept for offline use, as on its menu row
  const select = () => {
    if (organization.membership.archived && uiStore.getState().offlineAccess && !onlineManager.isOnline()) {
      return toaster.warning(t('c:show_archived.offline.text'));
    }
    showMenuOrganization(organization);
  };

  return (
    <DropdownSelectItem selected={selected} onSelect={select}>
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

interface SwitcherMenuProps {
  currentId: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onManage: () => void;
}

function ArchivedOrganizationsMenu({ currentId }: Pick<SwitcherMenuProps, 'currentId'>) {
  const { t } = useTranslation();
  const { archived } = useSwitcherOrganizations();

  return (
    <>
      <DropdownActionItem icon={ChevronLeftIcon} closeOnSelect={false} onSelect={() => dropdowner.getState().back()}>
        {t('c:back')}
      </DropdownActionItem>
      <DropdownActionSeparator />
      {archived.map((organization) => (
        <SwitcherOrganizationItem key={organization.id} organization={organization} selected={organization.id === currentId} />
      ))}
    </>
  );
}

function OrganizationSwitcherMenu({ currentId, triggerRef, onManage }: SwitcherMenuProps) {
  const { t } = useTranslation();
  const { active, archived } = useSwitcherOrganizations();
  const archivedUnseenCount = useUnseenCount(collectChannelIds(archived, { archived: true }));
  const createAction = getMenuSection('organization')?.createAction;

  return (
    <>
      {active.map((organization) => (
        <SwitcherOrganizationItem key={organization.id} organization={organization} selected={organization.id === currentId} />
      ))}
      <DropdownActionSeparator />
      {!!archived.length && (
        <DropdownActionItem
          icon={ArchiveIcon}
          closeOnSelect={false}
          onSelect={() => dropdowner.getState().push(<ArchivedOrganizationsMenu currentId={currentId} />)}
        >
          <span className="grow text-left">{t('c:archived')}</span>
          {archivedUnseenCount > 0 ? (
            <CountBadge count={archivedUnseenCount} />
          ) : (
            <span className="text-muted-foreground text-xs">{archived.length}</span>
          )}
          <ChevronRightIcon className="opacity-50" />
        </DropdownActionItem>
      )}
      <div className="flex gap-1">
        <DropdownActionItem icon={Settings2Icon} onSelect={onManage} className="flex-1 justify-center">
          {t('c:manage')}
        </DropdownActionItem>
        {createAction && (
          <DropdownActionItem
            icon={PlusIcon}
            onSelect={() => {
              // The create dialog opens over the page, as from the menu section's plus button on mobile
              closeNavSheet();
              createAction(triggerRef);
            }}
            className="flex-1 justify-center"
          >
            {t('c:create')}
          </DropdownActionItem>
        )}
      </div>
    </>
  );
}

interface OrganizationSwitcherProps {
  organization: UserMenuItem;
  /** Turns the menu sheet to managing the organizations in place. */
  onManage: () => void;
}

/** Heads the mobile menu sheet with the organization it shows; picking another swaps the sheet to that one. */
export function OrganizationSwitcher({ organization, onManage }: OrganizationSwitcherProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { active } = useSwitcherOrganizations();

  // Unseen news elsewhere, the reason to switch
  const otherUnseenCount = useUnseenCount(collectChannelIds(active.filter((item) => item.id !== organization.id)));

  const openMenu = () => {
    dropdowner.getState().create(<OrganizationSwitcherMenu currentId={organization.id} triggerRef={triggerRef} onManage={onManage} />, {
      id: 'organization-switcher',
      triggerId: 'organization-switcher',
      triggerRef,
      kind: 'menu',
    });
  };

  return (
    <div className="px-3 pb-2">
      <Button
        ref={triggerRef}
        variant="outline"
        onClick={openMenu}
        aria-label={t('c:switch_organization', { name: organization.name })}
        className="h-14 w-full justify-start gap-3 px-3 data-dropdowner-active:bg-accent"
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
        {otherUnseenCount > 0 && <CountBadge count={otherUnseenCount} className="shrink-0" />}
        <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
      </Button>
    </div>
  );
}
