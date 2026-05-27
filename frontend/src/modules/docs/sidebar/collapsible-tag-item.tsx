import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';
import { ActiveIndicator } from './active-indicator';

const tagTypeConfig = {
  operations: {
    linkTo: '/docs/operations' as const,
    getHash: (name: string) => `tag/${name}`,
    getSearch: (isExpanded: boolean, name: string) => ({ operationTag: isExpanded ? undefined : name }),
    triggerClassName: 'text-left',
  },
  schemas: {
    linkTo: '/docs/schemas' as const,
    getHash: (name: string) => name,
    getSearch: (isExpanded: boolean, name: string) => ({ schemaTag: isExpanded ? undefined : name }),
    triggerClassName: 'justify-start lowercase',
  },
};

type TagType = keyof typeof tagTypeConfig;

type CollapsibleTagItemProps<T> = {
  type: TagType;
  tag: { name: string; count: number };
  items: T[];
  isExpanded: boolean;
  isActive: boolean;
  activeItemIndex: number;
  layoutId: string;
  renderItem: (item: T, index: number, isActive: boolean) => ReactNode;
  itemKey: (item: T) => string;
  /** Called on hover to trigger prerendering of this tag's details in the page */
  onPrerender?: () => void;
};

function CollapsibleTagItemBase<T>({
  type,
  tag,
  items,
  isExpanded,
  isActive,
  activeItemIndex,
  layoutId,
  renderItem,
  itemKey,
  onPrerender,
}: CollapsibleTagItemProps<T>) {
  const isMobile = useBreakpointBelow('sm', false);
  const { linkTo, getSearch, getHash, triggerClassName } = tagTypeConfig[type];
  const hash = getHash(tag.name);

  return (
    <Collapsible open={isExpanded}>
      <SidebarMenuItem className="group/tag relative" data-expanded={isExpanded} data-active={isActive}>
        <div className="pointer-events-none absolute top-4.5 bottom-3 left-2.5 hidden flex-col items-center group-data-[expanded=true]/tag:flex">
          <div className="w-px flex-1 bg-muted-foreground/30" />
        </div>
        <CollapsibleTrigger
          render={
            <Link
              to={linkTo}
              search={(prev) => ({ ...prev, ...getSearch(isExpanded, tag.name) })}
              hash={hash}
              replace
              resetScroll={false}
              draggable={false}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                'group h-8 w-full pl-5 font-normal opacity-80',
                'group-data-[active=true]/tag:bg-accent group-data-[expanded=true]/tag:opacity-100',
                triggerClassName,
              )}
              onMouseEnter={!isExpanded ? onPrerender : undefined}
              onClick={() => {
                requestAnimationFrame(() => scrollToSectionById(hash));
                if (!isMobile) useSheeter.getState().remove('docs-sidebar');
              }}
            />
          }
        >
          <div className="absolute left-[0.53rem] h-1 w-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
          <span>{tag.name}</span>
          <span className="ml-2 text-muted-foreground/90 text-xs opacity-0 transition-opacity group-data-[expanded=true]/tag:hidden sm:group-hover:opacity-100">
            {tag.count}
          </span>
          <ChevronDownIcon className="invisible ml-auto size-4 opacity-40 transition-transform duration-200 group-hover:visible group-data-[expanded=true]/tag:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent
          className={cn(
            'overflow-hidden',
            !isMobile && 'data-closed:animate-collapsible-up data-open:animate-collapsible-down',
          )}
        >
          <div className="relative flex flex-col px-0 py-1">
            <ActiveIndicator activeIndex={activeItemIndex} layoutId={layoutId} isMobile={isMobile} />
            {items.map((item, index) => (
              <div key={itemKey(item)}>{renderItem(item, index, activeItemIndex === index)}</div>
            ))}
          </div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function collapsibleTagItemEqual<T>(prev: CollapsibleTagItemProps<T>, next: CollapsibleTagItemProps<T>) {
  return (
    prev.type === next.type &&
    prev.isActive === next.isActive &&
    prev.isExpanded === next.isExpanded &&
    prev.activeItemIndex === next.activeItemIndex &&
    prev.tag === next.tag &&
    prev.items === next.items
  );
}

// memo doesn't preserve generics, so we cast
export const CollapsibleTagItem = memo(
  CollapsibleTagItemBase,
  collapsibleTagItemEqual,
) as typeof CollapsibleTagItemBase;
