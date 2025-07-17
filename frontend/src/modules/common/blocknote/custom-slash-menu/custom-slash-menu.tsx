import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { customSlashIndexedItems } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockTypes } from '~/modules/common/blocknote/types';

export const slashMenu = (props: SuggestionMenuProps<DefaultReactSuggestionItem>, originalItemCount: number, allowedTypes: CustomBlockTypes[]) => {
  const { items, loadingState, selectedIndex, onItemClick } = props;
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isMobile = useBreakpoints('max', 'sm');
  const indexedItemCount = customSlashIndexedItems.filter((item) => allowedTypes.includes(item)).length;

  const handleKeyPress = async (e: KeyboardEvent) => {
    const { key: pressedKey } = e;
    const itemIndex = Number.parseInt(pressedKey, 10) - 1; // Convert pressed key to an index

    if (isMobile || items.length !== originalItemCount || Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= indexedItemCount) return;

    const item = items[itemIndex];
    if (!item) return;

    return triggerItemClick(item, e);
  };

  const triggerItemClick = (item: DefaultReactSuggestionItem, event: KeyboardEvent | React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();
    onItemClick?.(item);
  };

  useEffect(() => {
    // Ensure that all items are loaded
    if (loadingState !== 'loaded') return;

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [loadingState]);

  // To be able to use in sheet
  useEffect(() => {
    const bodyStyle = document.body.style;
    const pointerEventsOnOpen = bodyStyle.pointerEvents;
    bodyStyle.pointerEvents = 'auto';

    return () => {
      bodyStyle.pointerEvents = pointerEventsOnOpen;
    };
  }, []);

  // Scroll to the selected item when it changes
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex || 0];
    selectedItem?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div className="slash-menu">
      {items.map((item, index) => (
        <div role="tablist" key={item.title}>
          {!isMobile && index === indexedItemCount && items.length === originalItemCount && <hr className="slash-menu-separator" />}
          <button
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selectedIndex === index}
            className="slash-menu-item !px-[0.5rem]"
            onMouseDown={(e) => triggerItemClick(item, e)}
            tabIndex={0}
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
};
