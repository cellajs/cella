import { type DefaultSuggestionItem, filterSuggestionItems } from '@blocknote/core/extensions';
import { type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems, SuggestionMenuController, type SuggestionMenuProps } from '@blocknote/react';
import { useEffect, useRef } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { getChecklistSlashItem } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';
import { getNotifySlashItem } from '~/modules/common/blocknote/custom-elements/notify/notify-block';
import type { CustomBlockNoteEditor, CustomBlockNoteMenuProps, CustomBlockTypes, SlashItemKeys } from '~/modules/common/blocknote/types';

const baseBlockNoteTypeToKeys = {
  table: ['table'],
  notify: ['notify'],
  paragraph: ['paragraph'],
  heading: ['heading', 'heading_2', 'heading_3', 'heading_4', 'heading_5', 'heading_6'],
  quote: ['quote'],
  codeBlock: ['code_block'],
  bulletListItem: ['bullet_list'],
  numberedListItem: ['numbered_list'],
  checklistItem: ['checklistItem'],
  // BlockNote's own check list offers no slash item.
  checkListItem: [],
  file: ['file'],
  image: ['image'],
  video: ['video'],
  audio: ['audio'],
  toggleListItem: ['toggle_list'],
  divider: ['divider'],
} satisfies Record<CustomBlockTypes, SlashItemKeys[]>;

/** The slash items a digit key picks, in order: at most nine. */
const customSlashIndexedItems: CustomBlockTypes[] = ['image', 'video', 'file', 'bulletListItem', 'numberedListItem', 'checklistItem', 'notify'];

const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: CustomBlockNoteMenuProps['headingLevels'],
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getNotifySlashItem(editor), getChecklistSlashItem(editor)];

  const { heading, ...restTypeToKeys } = baseBlockNoteTypeToKeys;
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.some((headingLevel) => headingLevel === level);
  });

  const allowedTypeToKeys = { ...restTypeToKeys, heading: filteredHeading };

  const filteredTypeToKeys = Object.fromEntries(allowedTypes.map((type) => [type, allowedTypeToKeys[type]]));

  const allowedKeys: Set<string> = new Set(Object.values(filteredTypeToKeys).flat());

  const sortOrder = new Map<string, number>(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index] as const)),
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => 'key' in item && typeof item.key === 'string' && allowedKeys.has(item.key))
    .sort(({ key: first }, { key: second }) => {
      const firstIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const secondIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return firstIndex - secondIndex;
    });
};

export function CustomSlashMenu({ editor, allowedTypes, headingLevels }: CustomBlockNoteMenuProps) {
  const slashMenuItems = getSlashMenuItems(editor, allowedTypes, headingLevels);

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={async (query) => filterSuggestionItems(slashMenuItems, query)}
      suggestionMenuComponent={(props) => <SlashMenuList {...props} originalItemCount={slashMenuItems.length} allowedTypes={allowedTypes} />}
    />
  );
}

interface SlashMenuListProps extends SuggestionMenuProps<DefaultReactSuggestionItem> {
  originalItemCount: number;
  allowedTypes: CustomBlockTypes[];
}

function SlashMenuList({ items, loadingState, selectedIndex, onItemClick, originalItemCount, allowedTypes }: SlashMenuListProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const indexedItemCount = customSlashIndexedItems.filter((type) => allowedTypes.includes(type)).length;
  const hasDigitShortcuts = items.length === originalItemCount;

  const handleKeyDown = (event: KeyboardEvent) => {
    const itemIndex = Number.parseInt(event.key, 10) - 1;

    if (!hasDigitShortcuts || Number.isNaN(itemIndex) || itemIndex < 0 || itemIndex >= indexedItemCount) return;

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

    if (itemTop < scrollTop) menuContainer.scrollTop = itemTop;
    else if (itemBottom > scrollBottom) menuContainer.scrollTop = itemBottom - menuContainer.clientHeight;
  }, [selectedIndex]);

  return (
    <div
      className="bg-popover flex max-h-[40vh] flex-col overflow-y-auto rounded-lg border-[0.05rem] p-1 shadow-[0_0.05rem_0.3rem_0_rgb(0_0_0/0.1)]"
      role="listbox"
      ref={menuRef}
    >
      {items.map((item, index) => (
        <div key={item.title}>
          {hasDigitShortcuts && index === indexedItemCount && <hr className="my-1" />}
          <button
            ref={(element) => {
              itemRefs.current[index] = element;
            }}
            role="option"
            type="button"
            aria-selected={selectedIndex === index}
            // BlockNote's shadcn theme resets icons without a size-* class from an unlayered rule, which only `!` outranks.
            className="hover:bg-accent aria-selected:bg-accent flex h-9 min-w-56 items-center justify-between rounded-sm px-2 [&_svg]:size-4!"
            onClick={() => onItemClick?.(item)}
            tabIndex={-1}
          >
            <div className="mr-2 flex items-center gap-3 text-sm">
              {item.icon}
              {item.title}
            </div>
            {hasDigitShortcuts && index < indexedItemCount && (
              <span className="text-faint-foreground flex min-w-4 py-0.5 pl-1 text-[0.8rem]">{index + 1}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
