import { ChevronDownIcon, InfoIcon, PlusIcon, Settings2Icon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChannelEntityType, isChannelArchivable } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import type { TKey } from '~/lib/i18n-locales';
import { AlertBanner } from '~/modules/common/alerter/alert-banner';
import { collapseMotion } from '~/modules/common/collapse-motion';
import { CountBadge } from '~/modules/common/count-badge';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedGroup } from '~/modules/navigation/menu-sheet/archived-group';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { activeUnseenChannelIds, menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetItemsList } from '~/modules/navigation/menu-sheet/items-list';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';

export type MenuSectionOptions = {
  label: TKey;
  entityType: ChannelEntityType;
  /** Opens the create flow; `organizationId` is set when it starts from one organization's menu sheet. */
  createAction?: (ref: RefObject<HTMLButtonElement | null>, organizationId?: string) => void;
  icon?: IconComponent;
};

/**
 * Enter, exit and timing props for the icon buttons that appear beside a menu sheet section toggle once the section
 * opens. Like `collapseMotion`, they run on a toggle only, so width and margin lay out on every screen size.
 */
const closed = { width: 0, marginLeft: 0, opacity: 0 };

const widenMotion = {
  initial: closed,
  animate: { width: '2.5rem', marginLeft: '0.5rem', opacity: 1 },
  exit: closed,
  transition: { bounce: 0, duration: 0.2 },
};

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

  // Cumulative over the section's non-archived, non-muted items.
  const sectionUnseenCount = useUnseenCount(channelIds);

  const createButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="bg-card sticky top-0 z-10 flex items-center pt-2">
      {isCollapsible ? (
        <Button
          onClick={() => setSectionOpen(options.entityType, !isSectionVisible)}
          className="group-label min-w-0 flex-1 justify-between"
          variant="ghost"
        >
          <div className="flex items-center">
            <span className="mr-1 flex items-center">{t(options.label)}</span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="text-faint-foreground inline-block px-2 py-1 font-normal group-data-[visible=true]/menu-section:hidden"
            >
              {sectionUnseenCount > 0 ? (
                <CountBadge count={sectionUnseenCount} className="inline-flex" />
              ) : (
                items.filter((item) => !item.membership.archived).length
              )}
            </motion.span>
          </div>

          <ChevronDownIcon className="opacity-50 transition-transform duration-200 group-data-[visible=true]/menu-section:rotate-180" />
        </Button>
      ) : (
        // Matches the toggle's text box, so the label sits where a collapsible section shows it
        <div className="group-label flex h-10 min-w-0 flex-1 items-center px-3 whitespace-nowrap">{t(options.label)}</div>
      )}

      {/* initial={false} so opening the sheet doesn't widen every open section at once, only a toggle does */}
      <AnimatePresence initial={false}>
        {isSectionVisible && !!items.length && (
          <motion.div key={`settings-${options.entityType}`} {...widenMotion} className="shrink-0 max-sm:hidden">
            <TooltipButton toolTipContent={t('c:manage_content')} side="bottom" sideOffset={10}>
              <Button variant={isEditing ? 'secondary' : 'ghost'} size="icon" onClick={onToggleEditing}>
                <Settings2Icon className="size-5" />
              </Button>
            </TooltipButton>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isSectionVisible && onCreate && (
          <motion.div key={`create-${options.entityType}`} {...widenMotion} className="shrink-0">
            <TooltipButton toolTipContent={t('c:create')} sideOffset={22} side="right">
              <Button ref={createButtonRef} variant="ghost" size="icon" onClick={() => onCreate(createButtonRef)}>
                <PlusIcon className="size-5" />
              </Button>
            </TooltipButton>
          </motion.div>
        )}
      </AnimatePresence>
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
  const archivedSectionKey = `${options.entityType}-archived`;
  const isArchivedVisible = useNavigationStore((state) => state.activeSections?.[archivedSectionKey] ?? true);
  // Beside other sections the organization one starts collapsed: users seldom navigate there
  const isOpenByDefault = options.entityType !== 'organization';
  const isSectionVisible = useNavigationStore((state) => !isCollapsible || (state.activeSections?.[options.entityType] ?? isOpenByDefault));
  const archivedItems = items.filter((item) => item.membership.archived);
  const archivedCount = archivedItems.length;
  const activeChannelIds = activeUnseenChannelIds(items);
  const archivedChannelIds = archivedItems.flatMap((item) => menuUnseenChannelIds(item, true));

  const handleCreate = options.createAction
    ? (ref: RefObject<HTMLButtonElement | null>) => {
        if (isMobile) closeNavSheet();
        options.createAction?.(ref, organizationId);
      }
    : undefined;

  const handleToggleEditing = () => setIsEditing(!isEditing);

  const handleToggleArchived = () => setSectionOpen(archivedSectionKey, !isArchivedVisible);

  const prepareArchive = () => {
    if (isArchivedVisible) return false;
    setSectionOpen(archivedSectionKey, true);
    return !!archivedCount;
  };

  const hasArchivedGroup = !!archivedCount || (!!items.length && isEditing && isChannelArchivable(options.entityType));

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
          <motion.div
            key="alert"
            {...collapseMotion}
            transition={{ height: { duration: 0.3 }, opacity: { delay: 0.3, duration: 0.2 } }}
            className="overflow-hidden"
          >
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
              <MenuSheetItemsListEdit items={items} isArchived={false} options={options} prepareArchive={prepareArchive} />
            ) : (
              <MenuSheetItemsList entityType={options.entityType} items={items} isArchived={false} options={options} />
            )}
            {hasArchivedGroup && (
              <li>
                <MenuSheetArchivedGroup
                  isOpen={isArchivedVisible}
                  onToggle={handleToggleArchived}
                  archivedCount={archivedCount}
                  archivedChannelIds={archivedChannelIds}
                  dropItems={isEditing ? items : undefined}
                >
                  {isEditing ? (
                    <MenuSheetItemsListEdit items={items} isArchived={true} options={options} />
                  ) : (
                    <MenuSheetItemsList entityType={options.entityType} items={items} options={options} isArchived={true} />
                  )}
                </MenuSheetArchivedGroup>
              </li>
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
