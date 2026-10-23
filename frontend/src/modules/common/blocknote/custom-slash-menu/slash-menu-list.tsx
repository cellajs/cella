import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { customSlashIndexedItems } from '~/modules/common/blocknote/blocknote-schema';
import type { CustomBlockTypes } from '~/modules/common/blocknote/types';

interface SlashMenuListProps extends SuggestionMenuProps<DefaultReactSuggestionItem> {
  originalItemCount: number;
  allowedTypes: CustomBlockTypes[];
}

export function SlashMenuList({ items, loadingState, selectedIndex, onItemClick, originalItemCount, allowedTypes }: SlashMenuListProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const indexedItemCount = customSlashIndexedItems.filter((type) => allowedTypes.includes(type)).length;

  const handleKeyDown = (event: KeyboardEvent) => {
    const itemIndex = Number.parseInt(event.key, 10) - 1;

    if (items.length !== originalItemCount || Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= indexedItemCount) return;

    const item = items[itemIndex];
    if (!item) return;

    event.preventDefault();
    onItemClick?.(item);
  };

  useEventListener('keydown', handleKeyDown, { enabled: loadingState === 'loaded' });

  // Scroll within the menu container only, never the page.
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex || 0];
    const menuContainer = menuRef.current;
    if (!selectedItem || !menuContainer) return;

    const itemTop = selectedItem.offsetTop;
    const itemBottom = itemTop + selectedItem.offsetHeight;
    const scrollTop = menuContainer.scrollTop;
    const scrollBottom = scrollTop + menuContainer.clientHeight;

    if (itemTop < scrollTop) {
      menuContainer.scrollTop = itemTop;
    } else if (itemBottom > scrollBottom) {
      menuContainer.scrollTop = itemBottom - menuContainer.clientHeight;
    }
  }, [selectedIndex]);

  return (
    <div
      className="flex max-h-[40vh] flex-col overflow-y-auto rounded-lg border-[0.05rem] bg-popover p-1 shadow-[0_0.05rem_0.3rem_0_rgb(0_0_0/0.1)]"
      role="listbox"
      ref={menuRef}
    >
      {items.map((item, index) => (
        <div key={item.title}>
          {index === indexedItemCount && items.length === originalItemCount && <hr className="my-1" />}
          <button
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            role="option"
            type="button"
            aria-selected={selectedIndex === index}
            // BlockNote's shadcn theme resets icons without a size-* class from an unlayered rule, which only `!` outranks.
            className="flex h-9 min-w-56 items-center justify-between rounded-sm px-2 hover:bg-accent/60 aria-selected:bg-accent [&_svg]:size-4!"
            onClick={() => onItemClick?.(item)}
            tabIndex={-1}
          >
            <div className="mr-2 flex items-center gap-3 text-sm">
              {item.icon}
              {item.title}
            </div>
            {items.length === originalItemCount && index < indexedItemCount && (
              <span className="flex min-w-4 py-0.5 pl-1 text-[0.8rem] text-muted-foreground/70">{index + 1}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
