import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { customSlashIndexedItems } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockTypes } from '~/modules/common/blocknote/types';

interface CustomSlashMenuComponentProps extends SuggestionMenuProps<DefaultReactSuggestionItem> {
  originalItemCount: number;
  allowedTypes: CustomBlockTypes[];
}

export function CustomSlashMenuComponent({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
  originalItemCount,
  allowedTypes,
}: CustomSlashMenuComponentProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const indexedItemCount = customSlashIndexedItems.filter((item) => allowedTypes.includes(item)).length;

  const handleKeyPress = (e: KeyboardEvent) => {
    const { key: pressedKey } = e;
    const itemIndex = Number.parseInt(pressedKey, 10) - 1;

    if (items.length !== originalItemCount || Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= indexedItemCount) return;

    const item = items[itemIndex];
    if (!item) return;

    e.preventDefault();
    onItemClick?.(item);
  };

  useEventListener('keydown', handleKeyPress, { enabled: loadingState === 'loaded' });

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
      className="flex h-fit max-h-[40vh] flex-col overflow-y-auto rounded-lg border-[0.05rem] bg-popover p-1 shadow-[0_0.05rem_0.3rem_0_rgb(0_0_0/0.1)]"
      role="listbox"
      ref={menuRef}
    >
      {items.map((item, index) => (
        <div key={item.title}>
          {index === indexedItemCount && items.length === originalItemCount && <hr className="my-1" />}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            type="button"
            aria-selected={selectedIndex === index}
            // BlockNote's shadcn theme resets icons without a size-* class from an unlayered rule, which only `!` outranks.
            className="flex h-9 min-w-56 items-center justify-between rounded-sm px-2 text-md hover:bg-accent/60 aria-selected:bg-accent [&_svg]:size-4!"
            onClick={() => onItemClick?.(item)}
            tabIndex={-1}
          >
            <div className="mr-2 flex items-center gap-3 text-sm">
              {item.icon}
              {item.title}
            </div>
            {items.length === originalItemCount && index < indexedItemCount && (
              <span className="flex min-w-4 items-center py-0.5 pl-1 text-[0.8rem] text-muted-foreground opacity-50">{index + 1}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
