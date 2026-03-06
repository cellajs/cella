import { Link } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { useBreakpointWithin } from '~/hooks/use-breakpoints';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import type { SchemaTag } from '~/modules/docs/types';
import { buttonVariants } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/modules/ui/collapsible';
import { SidebarMenuItem } from '~/modules/ui/sidebar';
import { cn } from '~/utils/cn';
import { useSheeter } from '../../common/sheeter/use-sheeter';

// Use rem values for proper mobile scaling
const ITEM_HEIGHT_REM = 2; // 32px at base 16px
const LIST_PADDING_TOP_REM = 0.25; // 4px at base 16px
const INDICATOR_OFFSET_REM = 0.5; // 8px at base 16px
const INDICATOR_HEIGHT_REM = 1; // 16px (ITEM_HEIGHT - 16)

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
    getSearch: (isExpanded: boolean, name: string) => ({ schemaTag: isExpanded ? undefined : (name as SchemaTag) }),
    triggerClassName: 'justify-start lowercase',
  },
};

export type TagType = keyof typeof tagTypeConfig;

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
  const isMobile = useBreakpointWithin('xs', false);
  const { linkTo, getSearch, getHash, triggerClassName } = tagTypeConfig[type];
  const hash = getHash(tag.name);

  return (
    <Collapsible open={isExpanded}>
      <SidebarMenuItem className="relative group/tag" data-expanded={isExpanded} data-active={isActive}>
        <div className="absolute left-2.5 top-4.5 bottom-3 flex-col items-center pointer-events-none hidden group-data-[expanded=true]/tag:flex">
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
              draggable="false"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'default' }),
                'w-full pl-5 h-8 font-normal group opacity-80',
                'group-data-[expanded=true]/tag:opacity-100 group-data-[active=true]/tag:bg-accent',
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
          <div className="absolute left-[0.53rem] w-1 h-1 rounded-full bg-muted-foreground/30 group-data-[expanded=true]/tag:bg-muted-foreground/60" />
          <span>{tag.name}</span>
          <span className="ml-2 text-xs text-muted-foreground/90 font-light opacity-0 sm:group-hover:opacity-100 transition-opacity group-data-[expanded=true]/tag:hidden">
            {tag.count}
          </span>
          <ChevronDownIcon className="size-4 invisible group-hover:visible transition-transform duration-200 opacity-40 ml-auto group-data-[expanded=true]/tag:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[open]:animate-collapsible-down data-[closed]:animate-collapsible-up">
          <div className="relative flex flex-col py-1 px-0">
            {activeItemIndex >= 0 && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                className="w-[0.20rem] bg-primary rounded-full absolute left-2 ml-px"
                style={{
                  top: `${LIST_PADDING_TOP_REM + activeItemIndex * ITEM_HEIGHT_REM + INDICATOR_OFFSET_REM}rem`,
                  height: `${INDICATOR_HEIGHT_REM}rem`,
                }}
              />
            )}
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
