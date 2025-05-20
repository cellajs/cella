import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';

export const slashMenu = (props: SuggestionMenuProps<DefaultReactSuggestionItem>, indexedItemCount: number, originalItemCount: number) => {
  const { items, loadingState, selectedIndex, onItemClick } = props;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMobile = useBreakpoints('max', 'sm');

  const handleKeyPress = async (e: KeyboardEvent) => {
    const { key: pressedKey } = e;
    const itemIndex = Number.parseInt(pressedKey, 10) - 1; // Convert pressed key to an index

    if (isMobile || items.length !== originalItemCount || Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= indexedItemCount) return;

    const item = items[itemIndex];
    if (!item) return;

    return triggerItemClick(item, e);
  };

  const triggerItemClick = (item: DefaultReactSuggestionItem, event: KeyboardEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
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
        <div key={item.title}>
          {!isMobile && index === indexedItemCount && items.length === originalItemCount && <hr className="slash-menu-separator" />}
          <div
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className="slash-menu-item"
            aria-selected={selectedIndex === index}
            onMouseDown={(e) => triggerItemClick(item, e)}
            onKeyDown={() => {}}
            // biome-ignore lint/a11y/useSemanticElements: req by author
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3 mr-2 text-sm">
              {item.icon}
              {item.title}
            </div>
            {!isMobile && items.length === originalItemCount && index < indexedItemCount && (
              <span className="slash-menu-item-badge">{index + 1}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
