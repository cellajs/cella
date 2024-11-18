import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { useCallback, useEffect, useState } from 'react';
import { customSlashIndexedItems, customSlashNotIndexedItems, menusTitleToAllowedType } from '~/modules/common/blocknote/blocknote-config';
import type { BasicBlockTypes, CellaCustomBlockTypes, CustomBlockNoteSchema, MenusItemsTitle } from '~/modules/common/blocknote/types';

const indexedItems: readonly string[] = customSlashIndexedItems;
const notIndexedItems: readonly string[] = customSlashNotIndexedItems;

export const slashMenu = (
  props: SuggestionMenuProps<DefaultReactSuggestionItem>,
  editor: CustomBlockNoteSchema,
  allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[],
) => {
  const { items, selectedIndex, onItemClick } = props;
  const [inputValue, setInputValue] = useState('');

  const allowedBlockTypes: readonly string[] = allowedTypes;
  // Filter function to check if the MenusItemsTitle has an allowed type
  const isAllowed = (item: string) => {
    const allowedType = menusTitleToAllowedType[item as MenusItemsTitle];
    return allowedType && allowedBlockTypes.includes(allowedType);
  };

  // Apply the filter to customSlashIndexedItems and customSlashNotIndexedItems
  const slashMenuIndexed = indexedItems.filter(isAllowed);
  const slashMenuNotIndexed = notIndexedItems.filter(isAllowed);

  const sortList = [...slashMenuIndexed, ...slashMenuNotIndexed];

  // Create a mapping from title to index for quick lookup
  const sortOrder = new Map(sortList.map((title, index) => [title, index]));
  const sortedItems = items
    .filter(({ title }) => sortList.includes(title))
    .sort((a, b) => {
      const indexA = sortOrder.get(a.title);
      const indexB = sortOrder.get(b.title);
      // If both titles exist in sortOrder, compare their indices
      if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
      // If one title is not found, keep it at the end
      return indexA === undefined ? 1 : -1;
    });

  const handleKeyPress = useCallback(
    async (e: KeyboardEvent) => {
      const pressedKey = e.key;

      // Handle backspace key
      if (pressedKey === 'Backspace') return setInputValue((prev) => prev.slice(0, -1)); // Remove last character

      // If the pressed key is alphabetical, update inputValue
      if (pressedKey.length === 1) setInputValue((prev) => prev + pressedKey); // Append the pressed key

      // Convert pressed key to an index
      const itemIndex = Number.parseInt(pressedKey, 10) - 1;
      // Check if the pressed key corresponds to an item
      if (!Number.isNaN(itemIndex) && itemIndex >= 0 && itemIndex < customSlashIndexedItems.length && inputValue.length === 0) {
        const item = sortedItems[itemIndex];
        if (!item) return;
        // media block opens only if document have next block
        if (item.group === 'Media') {
          const { nextBlock } = editor.getTextCursorPosition();

          // if exist next block trigger item
          if (nextBlock) return triggerItemClick(item, e);

          // if no next block create one and trigger item
          const block = await editor.tryParseMarkdownToBlocks('');
          editor.replaceBlocks(editor.document, [...editor.document, ...block]);
          setTimeout(() => triggerItemClick(item, e), 0);
          return;
        }
        triggerItemClick(item, e);
      }
    },
    [sortedItems],
  );

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
    <div className="bn-shadcn slash-menu">
      {sortedItems.map((item, index) => {
        const isSelected = selectedIndex === index;
        return (
          <div key={item.title}>
            {index === slashMenuIndexed.length && <hr className="slash-menu-separator" />}
            <div
              className={`slash-menu-item${isSelected ? ' selected' : ''}`}
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
              {!inputValue.length && index < slashMenuIndexed.length && <span className="slash-menu-item-badge">{index + 1}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
