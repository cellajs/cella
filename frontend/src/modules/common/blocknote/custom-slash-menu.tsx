import { type DefaultReactSuggestionItem, type SuggestionMenuProps, SuggestionMenuController } from '@blocknote/react';

const slashMenu = (props: SuggestionMenuProps<DefaultReactSuggestionItem>) => {
  const { items, selectedIndex, onItemClick } = props;
  return (
    <div className="slash-menu">
      {items.map((item, index) => {
        const showSeparator = index > 0 && item.group !== items[index - 1].group;
        const isSelected = selectedIndex === index;

        return (
          <div key={item.title}>
            {showSeparator && <hr className="slash-menu-separator" />}
            <div
              className={`slash-menu-item${isSelected ? ' selected' : ''}`}
              onClick={() => onItemClick?.(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onItemClick?.(item);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-2 mr-2">
                {item.icon}
                {item.title}
              </div>
              {item.badge && <span className="slash-menu-item-badge">{item.badge}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const CustomSlashMenu = () => <SuggestionMenuController triggerCharacter={'/'} suggestionMenuComponent={slashMenu} />;
