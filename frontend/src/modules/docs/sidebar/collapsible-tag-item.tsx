import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { ActiveIndicator } from '~/modules/docs/sidebar/active-indicator';
import { sidebarBulletClass } from '~/modules/docs/sidebar/docs-sidebar-section';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, collapsiblePanelClass } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';

const tagTypeConfig = {
  operations: {
    linkTo: '/docs/operations' as const,
    getSearch: (collapse: boolean, name: string) => ({ operationTag: collapse ? undefined : name }),
  },
  schemas: {
    linkTo: '/docs/schemas' as const,
    getSearch: (collapse: boolean, name: string) => ({ schemaTag: collapse ? undefined : name }),
  },
};

type TagType = keyof typeof tagTypeConfig;

interface CollapsibleTagItemProps<T> {
  type: TagType;
  tag: { name: string; count: number };
  items: T[];
  isExpanded: boolean;
  /** The tag or one of its items is in view: highlights the row. */
  isActive: boolean;
  /** The tag's own section is current, not one of its items. */
  isAtTag: boolean;
  activeItemIndex: number;
  layoutId: string;
  renderItem: (item: T, isActive: boolean) => ReactNode;
  itemKey: (item: T) => string;
  /** Called on hover while the tag is collapsed, to prerender its details in the page. */
  onPrerender?: () => void;
}

function CollapsibleTagItemBase<T>({
  type,
  tag,
  items,
  isExpanded,
  isActive,
  isAtTag,
  activeItemIndex,
  layoutId,
  renderItem,
  itemKey,
  onPrerender,
}: CollapsibleTagItemProps<T>) {
  const isMobile = useBreakpointBelow('md', false);
  const { linkTo, getSearch } = tagTypeConfig[type];
  const hash = `tag/${tag.name}`;
  // Only a re-click at the tag itself collapses it; at one of its items or elsewhere, the click jumps here and leaves it open
  const collapseOnClick = isExpanded && isAtTag;

  return (
    <Collapsible open={isExpanded} render={<SidebarMenuItem className="group/tag" data-expanded={isExpanded} data-active={isActive} />}>
      <div className="pointer-events-none absolute top-4.5 bottom-3 left-2.5 hidden w-px bg-muted-foreground/30 group-data-[expanded=true]/tag:block" />
      <CollapsibleTrigger
        render={
          <Link
            to={linkTo}
            search={(prev) => ({ ...prev, ...getSearch(collapseOnClick, tag.name) })}
            hash={hash}
            replace
            resetScroll={false}
            draggable={false}
            className={cn(
              buttonVariants({ variant: 'ghost' }),
              'group focus-inset h-8 w-full justify-start pl-5 font-normal text-muted-foreground group-data-[active=true]/tag:bg-accent group-data-[active=true]/tag:font-medium group-data-[expanded=true]/tag:text-foreground',
            )}
            onMouseEnter={!isExpanded ? onPrerender : undefined}
            // Leaves the mobile sheet open, so expanding a tag shows its items
            onClick={() => requestAnimationFrame(() => scrollToSectionById(hash))}
          />
        }
      >
        <span className="truncate">{tag.name}</span>
        <span className="text-faint-foreground text-xs opacity-0 transition-opacity group-data-[expanded=true]/tag:hidden sm:group-hover:opacity-100">
          {tag.count}
        </span>
        <ChevronDownIcon className="invisible ml-auto shrink-0 opacity-40 transition-transform duration-200 group-hover:visible group-data-[expanded=true]/tag:rotate-180" />
      </CollapsibleTrigger>
      <div className={sidebarBulletClass} />
      <CollapsibleContent className={collapsiblePanelClass}>
        <div className="relative flex flex-col py-1">
          <ActiveIndicator activeIndex={activeItemIndex} layoutId={layoutId} isMobile={isMobile} />
          {items.map((item, index) => (
            <div key={itemKey(item)}>{renderItem(item, activeItemIndex === index)}</div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function collapsibleTagItemEqual<T>(prev: CollapsibleTagItemProps<T>, next: CollapsibleTagItemProps<T>) {
  return (
    prev.type === next.type &&
    prev.isActive === next.isActive &&
    prev.isAtTag === next.isAtTag &&
    prev.isExpanded === next.isExpanded &&
    prev.activeItemIndex === next.activeItemIndex &&
    prev.tag === next.tag &&
    prev.items === next.items
  );
}

// memo doesn't preserve generics, so we cast
export const CollapsibleTagItem = memo(CollapsibleTagItemBase, collapsibleTagItemEqual) as typeof CollapsibleTagItemBase;
