import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useEventListener } from '~/hooks/use-event-listener';
import { customSlashIndexedItems } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockTypes } from '~/modules/common/blocknote/types';
import { DialogTitle } from '~/modules/ui/dialog';
import { Drawer, DrawerContent } from '~/modules/ui/drawer';

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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpointBelow('sm');
  const indexedItemCount = customSlashIndexedItems.filter((item) => allowedTypes.includes(item)).length;

  // Track the position of the floating-ui parent container so we can mirror
  // it on the portaled menu. This lets us escape overflow:hidden and transform
  // stacking contexts created by ancestor elements (ResizablePanel, motion.div).
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (isMobile) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // The sentinel is rendered inside GenericPopover's floating div.
    // Walk up to that div to read its computed position.
    const floatingDiv = sentinel.parentElement;
    if (!floatingDiv) return;

    const sync = () => {
      const rect = floatingDiv.getBoundingClientRect();
      setPortalStyle({
        position: 'fixed',
        top: rect.top,
        left: rect.left,
        zIndex: 300,
      });
    };

    sync();

    // Re-sync whenever floating-ui updates the position (observed via style mutations)
    const observer = new MutationObserver(sync);
    observer.observe(floatingDiv, { attributes: true, attributeFilter: ['style'] });

    return () => observer.disconnect();
  }, [isMobile, items, selectedIndex]);

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
      <Drawer open={true}>
        <DrawerContent>
          <DialogTitle className="hidden" />
          {menuContent}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <>
      {/* Invisible sentinel stays in the floating-ui container to track position */}
      <div ref={sentinelRef} style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
      {createPortal(
        <div {...{ ['data-slash-menu-portal']: '' }} style={portalStyle}>
          {menuContent}
        </div>,
        document.body,
      )}
    </>
  );
};
