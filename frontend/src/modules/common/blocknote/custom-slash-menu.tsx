import { type DefaultReactSuggestionItem, SuggestionMenuController, type SuggestionMenuProps } from '@blocknote/react';
import { useCallback, useEffect } from 'react';

import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/blocknote-config';
import { getNotifyItems } from '~/modules/common/blocknote/notify';

const indexedItems = ['Image', 'Video', 'File', 'Bullet List', 'Numbered List', 'Check List', 'Notify', 'Emoji'];
const otherItems = ['Table', 'Audio', 'Heading 1', 'Heading 2', 'Heading 3', 'Paragraph'];

const sortList = [...indexedItems, ...otherItems];

const slashMenu = (props: SuggestionMenuProps<DefaultReactSuggestionItem>) => {
  const { items, selectedIndex, onItemClick } = props;

  // Create a mapping from title to index for quick lookup
  const sortOrder = new Map(sortList.map((title, index) => [title, index]));
  const sortedItems = items.sort((a, b) => {
    const indexA = sortOrder.get(a.title);
    const indexB = sortOrder.get(b.title);
    // If both titles exist in sortOrder, compare their indices
    if (indexA !== undefined && indexB !== undefined) return indexA - indexB;
    // If one title is not found, keep it at the end
    return indexA === undefined ? 1 : -1;
  });

  const handleKeyPress = useCallback(
    (e: KeyboardEvent) => {
      const pressedKey = e.key;
      // Convert pressed key to an index
      const itemIndex = Number.parseInt(pressedKey, 10) - 1;
      // Check if the pressed key corresponds to an item
      if (!Number.isNaN(itemIndex) && itemIndex >= 0 && itemIndex < indexedItems.length) {
        const item = sortedItems[itemIndex];
        if (item) {
          onItemClick?.(item);
          e.preventDefault();
        }
      }
    },
    [sortedItems, onItemClick],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <div className="slash-menu">
      {sortedItems.map((item, index) => {
        const isSelected = selectedIndex === index;
        return (
          <div key={item.title}>
            {index === indexedItems.length && <hr className="slash-menu-separator" />}
            <div
              className={`slash-menu-item${isSelected ? ' selected' : ''}`}
              onClick={() => onItemClick?.(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onItemClick?.(item);
              }}
              // biome-ignore lint/a11y/useSemanticElements: <explanation>
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-3 mr-2 text-sm">
                {item.icon}
                {item.title}
              </div>
              {index < indexedItems.length && <span className="slash-menu-item-badge">{index + 1}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const CustomSlashMenu = ({ editor }: { editor: CustomBlockNoteSchema }) => (
  <SuggestionMenuController triggerCharacter={'/'} getItems={async (query) => getNotifyItems(query, editor)} suggestionMenuComponent={slashMenu} />
);
