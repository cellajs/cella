import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

export const slashMenu = (
  props: SuggestionMenuProps<DefaultReactSuggestionItem>,
  editor: CustomBlockNoteSchema,
  indexedItemCount: number,
  originalItemCount: number,
) => {
  const { items, selectedIndex, onItemClick } = props;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isMobile = useBreakpoints('max', 'sm');

  const handleKeyPress = async (e: KeyboardEvent) => {
    const { key: pressedKey } = e;

    //prevent index click if search is active or if it's mobile
    if (isMobile || items.length !== originalItemCount) return;

    // Convert pressed key to an index
    const itemIndex = Number.parseInt(pressedKey, 10) - 1;
    // Check if the pressed key corresponds to an item
    if (!Number.isNaN(itemIndex) && itemIndex >= 0 && itemIndex < indexedItemCount) {
      const item = items[itemIndex];
      if (!item) return;
      // media block opens only if document has next block
      if (item.group === 'Media') {
        const { nextBlock } = editor.getTextCursorPosition();

        // if exist next block trigger item
        if (nextBlock) return triggerItemClick(item, e);

        // if no next block create one and trigger item
        const block = await editor.tryParseMarkdownToBlocks('');
        editor.replaceBlocks(editor.document, [...editor.document, ...block]);
        return setTimeout(() => triggerItemClick(item, e), 0);
      }
      return triggerItemClick(item, e);
    }
  };

  const triggerItemClick = (item: DefaultReactSuggestionItem, event: KeyboardEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.preventDefault();
    onItemClick?.(item);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // to be able to use in sheet
  useEffect(() => {
    const bodyStyle = document.body.style;
    const pointerEventsOnOpen = bodyStyle.pointerEvents;
    bodyStyle.pointerEvents = 'auto';

    return () => {
      bodyStyle.pointerEvents = pointerEventsOnOpen;
    };
  }, []);

  useEffect(() => {
    if (!selectedIndex) return;
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
