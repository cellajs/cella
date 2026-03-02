import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useEventListener } from '~/hooks/use-event-listener';
import { customSlashIndexedItems } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockTypes } from '~/modules/common/blocknote/types';
import { DialogTitle } from '~/modules/ui/dialog';
import { Drawer, DrawerContent, DrawerPortal } from '~/modules/ui/drawer';

interface CustomSlashMenuComponentProps extends SuggestionMenuProps<DefaultReactSuggestionItem> {
  originalItemCount: number;
  allowedTypes: CustomBlockTypes[];
}

// Proper React component (not a plain function) so hooks work correctly
// and React can optimize re-renders via reconciliation.
export const CustomSlashMenuComponent = ({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
  originalItemCount,
  allowedTypes,
}: CustomSlashMenuComponentProps) => {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpoints('max', 'sm');
  const indexedItemCount = customSlashIndexedItems.filter((item) => allowedTypes.includes(item)).length;

  const handleKeyPress = (e: KeyboardEvent) => {
    const { key: pressedKey } = e;
    const itemIndex = Number.parseInt(pressedKey, 10) - 1;

    if (
      isMobile ||
      items.length !== originalItemCount ||
      Number.isNaN(itemIndex) ||
      itemIndex < 0 ||
      itemIndex >= indexedItemCount
    )
      return;

    const item = items[itemIndex];
    if (!item) return;

    e.preventDefault();
    onItemClick?.(item);
  };

  // Ensure that all items are loaded before listening for keyboard shortcuts
  useEventListener('keydown', handleKeyPress, { enabled: loadingState === 'loaded' });

  // Scroll selected item into view within the menu container only (not the page)
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

  const menuContent = (
    <div className="slash-menu" role="listbox" ref={menuRef}>
      {items.map((item, index) => (
        <div key={item.title}>
          {!isMobile && index === indexedItemCount && items.length === originalItemCount && (
            <hr className="slash-menu-separator" />
          )}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="option"
            type="button"
            aria-selected={selectedIndex === index}
            className="slash-menu-item px-2!"
            onClick={() => onItemClick?.(item)}
            tabIndex={-1}
          >
            <div className="flex items-center gap-3 mr-2 text-sm">
              {item.icon}
              {item.title}
            </div>
            {!isMobile && items.length === originalItemCount && index < indexedItemCount && (
              <span className="slash-menu-item-badge">{index + 1}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={true} noBodyStyles>
        <DrawerPortal>
          <DrawerContent>
            <DialogTitle className="hidden" />
            {menuContent}
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    );
  }

  return menuContent;
};
