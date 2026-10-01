import { HistoryIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { ComboboxGroup, ComboboxGroupLabel, ComboboxItem } from '~/modules/ui/combobox';

/** A picked history row, which re-runs its query in place. */
export type HistoryEntry = { kind: 'history'; value: string };

interface SearchHistoryGroupProps {
  searches: string[];
  onRemove: (value: string) => void;
}

/** Recent searches as combobox rows, each with its index (typed into the empty input, it picks the row) and a remove button. */
export function SearchHistoryGroup({ searches, onRemove }: SearchHistoryGroupProps) {
  const { t } = useTranslation();

  return (
    <ComboboxGroup className="p-1">
      <ComboboxGroupLabel>{t('c:history')}</ComboboxGroupLabel>
      {searches.map((search, index) => (
        <ComboboxItem
          key={search}
          value={{ kind: 'history', value: search } as HistoryEntry}
          className="justify-between"
        >
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{search}</span>
          </div>
          <div className="flex items-center">
            <span className="mx-3 text-xs opacity-50 max-sm:hidden">{index}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('c:remove')}
              className="h-6 w-6 p-0"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(search);
              }}
            >
              <XIcon className="size-4 opacity-70 hover:opacity-100" />
            </Button>
          </div>
        </ComboboxItem>
      ))}
    </ComboboxGroup>
  );
}
