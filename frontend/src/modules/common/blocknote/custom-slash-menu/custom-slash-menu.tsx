import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useCallback, useEffect, useState } from 'react';
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';

export const slashMenu = (
  props: SuggestionMenuProps<DefaultReactSuggestionItem>,
  editor: CustomBlockNoteSchema,
  indexedItemCount: number,
  originalItemCount: number,
) => {
  const { items, selectedIndex, onItemClick } = props;

  const [inputValue] = useState('');

  const handleKeyPress = useCallback(async (e: KeyboardEvent) => {
    const { key: pressedKey } = e;

    // Convert pressed key to an index
    const itemIndex = Number.parseInt(pressedKey, 10) - 1;
    // Check if the pressed key corresponds to an item
    if (!Number.isNaN(itemIndex) && itemIndex >= 0 && itemIndex < indexedItemCount && inputValue.length === 0) {
      const item = items[itemIndex];
      if (!item) return;
      // media block opens only if document have next block
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
  }, []);

  const triggerItemClick = (item: DefaultReactSuggestionItem, event: KeyboardEvent | React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    event.preventDefault();
    onItemClick?.(item);
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // to be able to use in sheet
  useEffect(() => {
    const bodyStyle = document.body.style;
    const pointerEventsOnOpen = bodyStyle.pointerEvents;
    bodyStyle.pointerEvents = 'auto';

    return () => {
      bodyStyle.pointerEvents = pointerEventsOnOpen;
    };
  }, []);

  return (
    <div className="slash-menu">
      {items.map((item, index) => (
        <div key={item.title}>
          {index === indexedItemCount && items.length === originalItemCount && <hr className="slash-menu-separator" />}
          <div
            className="slash-menu-item"
            aria-selected={selectedIndex === index}
            onMouseDown={(e) => triggerItemClick(item, e)}
            onKeyDown={() => {}}
            // biome-ignore lint/a11y/useSemanticElements: <explanation>
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-3 mr-2 text-sm">
              {item.icon}
              {item.title}
            </div>
            {items.length === originalItemCount && index < indexedItemCount && <span className="slash-menu-item-badge">{index + 1}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
