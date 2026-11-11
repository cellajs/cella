import { ChevronDownIcon, InfoIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, isChannelHideable } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { CountBadge } from '~/modules/common/count-badge';
import type { IconComponent } from '~/modules/common/icons/types';
import { collapseMotion } from '~/modules/common/motion-presets';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { foldedToggleLabel, menuGroup } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { activeUnseenChannelIds, menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetHiddenGroup } from '~/modules/navigation/menu-sheet/hidden-group';
import { MenuSheetItemsList } from '~/modules/navigation/menu-sheet/items-list';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

export type MenuSectionOptions = {
  label: TKey;
  entityType: ChannelEntityType;
  /** Opens the create flow; `organizationId` is set when it starts from one organization's menu sheet. */
  createAction?: (ref: RefObject<HTMLButtonElement | null>, organizationId?: string) => void;
  icon?: IconComponent;
  /** A glyph in the corner of a row's avatar with its accessible name, such as a read-only mark for a role that cannot write. */
  rowMark?: (item: UserMenuItem) => { icon: IconComponent; label: TKey } | undefined;
};

// The icon buttons beside a section toggle: a closed section folds them to nothing, and a toggle widens them
const widenClass = tw(
  'grid shrink-0 grid-cols-[0fr] opacity-0 transition-[grid-template-columns,margin-left,opacity] duration-200 ease-out *:min-w-0 *:overflow-hidden motion-reduce:transition-opacity',
);
const widenOpenClass = tw('ml-2 grid-cols-[1fr] opacity-100');

interface MenuSheetSectionButtonProps {
  options: MenuSectionOptions;
  isEditing: boolean;
  isCollapsible: boolean;
  isSectionVisible: boolean;
  items: UserMenuItem[];
  channelIds: string[];
  onToggleEditing: () => void;
  onCreate?: (ref: RefObject<HTMLButtonElement | null>) => void;
}

/** The section's toggle row; it reads the unseen count itself, so a count change re-renders this row alone. */
function MenuSheetSectionButton({
  items,
  channelIds,
  options,
  isEditing,
  isCollapsible,
  isSectionVisible,
  onCreate,
  onToggleEditing,
}: MenuSheetSectionButtonProps) {
  const { t } = useTranslation();
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  // Cumulative over the section's non-hidden, non-muted items and their subitems.
  const sectionUnseenCount = useUnseenCount(channelIds);
  // The rows the section lists: neither hidden nor archived, subitems left out
  const activeCount = items.filter((item) => menuGroup(item) === 'active').length;

  const createButtonRef = useRef<HTMLButtonElement>(null);
  const hasSettings = isSectionVisible && items.length > 0;

  return (
    <div className="bg-card sticky top-0 z-10 flex items-center pt-2">
      {isCollapsible ? (
        <Button
          onClick={() => setSectionOpen(options.entityType, !isSectionVisible)}
          aria-expanded={isSectionVisible}
          aria-label={isSectionVisible ? undefined : foldedToggleLabel(t, t(options.label), activeCount, sectionUnseenCount)}
          // Open, it keeps its resting look; its ring sits inside, as the next sticky header covers one outside
          className="group-label focus-inset aria-expanded:text-muted-foreground aria-expanded:hover:bg-hover aria-expanded:hover:text-foreground min-w-0 flex-1 aria-expanded:bg-transparent"
          variant="ghost"
        >
          <span className="flex min-w-0 grow items-center gap-2">
            <span className="truncate">{t(options.label)}</span>
            {activeCount > 0 && (
              <span className="text-faint-foreground font-normal group-data-[visible=true]/menu-section:hidden">{activeCount}</span>
            )}
          </span>
          {sectionUnseenCount > 0 && <CountBadge count={sectionUnseenCount} className="shrink-0 group-data-[visible=true]/menu-section:hidden" />}
          <ChevronDownIcon className="shrink-0 opacity-50 transition-transform duration-200 group-data-[visible=true]/menu-section:rotate-180" />
        </Button>
      ) : (
        // Matches the toggle's text box, so the label sits where a collapsible section shows it
        <div className="group-label flex h-10 min-w-0 flex-1 items-center px-3 whitespace-nowrap">{t(options.label)}</div>
      )}

      <div inert={!hasSettings} className={cn(widenClass, hasSettings && widenOpenClass, 'max-sm:hidden')}>
        <TooltipButton toolTipContent={t('c:manage_content')} sideOffset={10}>
          <Button variant={isEditing ? 'secondary' : 'ghost'} size="icon" onClick={onToggleEditing}>
            <Settings2Icon className="size-5" />
          </Button>
        </TooltipButton>
      </div>
      {onCreate && (
        <div inert={!isSectionVisible} className={cn(widenClass, isSectionVisible && widenOpenClass)}>
          <TooltipButton toolTipContent={t('c:create')} sideOffset={22} side="right">
            <Button ref={createButtonRef} variant="ghost" size="icon" onClick={() => onCreate(createButtonRef)}>
              <PlusIcon className="size-5" />
            </Button>
          </TooltipButton>
        </div>
      )}
    </div>
  );
}

interface MenuSheetSectionProps {
  items: UserMenuItem[];
  options: MenuSectionOptions;
  /** False for a lone section: collapsing it would hide the whole sheet. */
  isCollapsible: boolean;
  /** Handed to the create action. */
  organizationId?: string;
}

export function MenuSheetSection({ items, options, isCollapsible, organizationId }: MenuSheetSectionProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  const [isEditing, setIsEditing] = useState(false);

  // Own entries only: toggling one section re-renders that section alone
  const hiddenSectionKey = `${options.entityType}-hidden`;
  const isHiddenVisible = useNavigationStore((state) => state.activeSections?.[hiddenSectionKey] ?? true);
  const archivedSectionKey = `${options.entityType}-archived`;
  const isArchivedVisible = useNavigationStore((state) => state.activeSections?.[archivedSectionKey] ?? false);
  // Beside other sections the organization one starts collapsed: users seldom navigate there
  const isOpenByDefault = options.entityType !== 'organization';
  const isSectionVisible = useNavigationStore((state) => !isCollapsible || (state.activeSections?.[options.entityType] ?? isOpenByDefault));
  const hiddenItems = items.filter((item) => menuGroup(item) === 'hidden');
  const hiddenCount = hiddenItems.length;
  const archivedItems = items.filter((item) => menuGroup(item) === 'archived');
  const activeChannelIds = activeUnseenChannelIds(items);

  const handleCreate = options.createAction
    ? (ref: RefObject<HTMLButtonElement | null>) => {
        if (isMobile) closeNavSheet();
        options.createAction?.(ref, organizationId);
      }
    : undefined;

  const handleToggleEditing = () => setIsEditing(!isEditing);

  const handleToggleHidden = () => setSectionOpen(hiddenSectionKey, !isHiddenVisible);

  const prepareHide = () => {
    if (isHiddenVisible) return false;
    setSectionOpen(hiddenSectionKey, true);
    return !!hiddenCount;
  };

  const hasHiddenGroup = !!hiddenCount || (!!items.length && isEditing && isChannelHideable(options.entityType));

  return (
    <div className="group/menu-section px-3" data-visible={isSectionVisible}>
      <MenuSheetSectionButton
        {...{ items, options, isEditing, isCollapsible, isSectionVisible }}
        channelIds={activeChannelIds}
        onToggleEditing={handleToggleEditing}
        onCreate={handleCreate}
      />
      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div key="alert" {...collapseMotion} className="overflow-hidden">
            <AlertBanner id="menu_management" variant="info" className="my-2" icon={InfoIcon} animate>
              {t('c:configure_menu.text')}
            </AlertBanner>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isSectionVisible && (
          <motion.ul key={options.entityType} {...menuListMotion}>
            {isEditing ? (
              <MenuSheetItemsListEdit items={items} group="active" options={options} prepareHide={prepareHide} />
            ) : (
              <MenuSheetItemsList entityType={options.entityType} items={items} group="active" options={options} />
            )}
            {hasHiddenGroup && (
              <li>
                <MenuSheetHiddenGroup
                  isOpen={isHiddenVisible}
                  onToggle={handleToggleHidden}
                  count={hiddenCount}
                  channelIds={isEditing ? undefined : hiddenItems.flatMap((item) => menuUnseenChannelIds(item, true))}
                  dropItems={isEditing ? items : undefined}
                >
                  {isEditing ? (
                    <MenuSheetItemsListEdit items={items} group="hidden" options={options} />
                  ) : (
                    <MenuSheetItemsList entityType={options.entityType} items={items} options={options} group="hidden" />
                  )}
                </MenuSheetHiddenGroup>
              </li>
            )}
            {!!archivedItems.length && (
              <li>
                <MenuSheetHiddenGroup
                  variant="archived"
                  isOpen={isArchivedVisible}
                  onToggle={() => setSectionOpen(archivedSectionKey, !isArchivedVisible)}
                  count={archivedItems.length}
                  channelIds={isEditing ? undefined : archivedItems.flatMap((item) => menuUnseenChannelIds(item, true))}
                >
                  {isEditing ? (
                    <MenuSheetItemsListEdit items={items} group="archived" options={options} />
                  ) : (
                    <MenuSheetItemsList entityType={options.entityType} items={items} options={options} group="archived" />
                  )}
                </MenuSheetHiddenGroup>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
