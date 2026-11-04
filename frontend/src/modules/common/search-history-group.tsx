import { HistoryIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SearchRecentRemoveButton } from '~/modules/common/search-clear-button';
import { SearchRowIcon } from '~/modules/common/search-row-icon';
import { ComboboxGroup, ComboboxGroupLabel, ComboboxItem } from '~/modules/ui/combobox';

/** A picked history row, which re-runs its query in place. */
export type HistoryEntry = { kind: 'history'; value: string };

export function isHistoryEntry(selection: object): selection is HistoryEntry {
  return 'kind' in selection && selection.kind === 'history';
}

interface SearchHistoryGroupProps {
  searches: string[];
  onRemove: (value: string) => void;
}

/** Recent searches as combobox rows, each with its index (typed into the empty input, it picks the row) and a remove button. */
export function SearchHistoryGroup({ searches, onRemove }: SearchHistoryGroupProps) {
  const { t } = useTranslation();

  return (
    <ComboboxGroup className="p-1">
      <ComboboxGroupLabel className="px-3">{t('c:history')}</ComboboxGroupLabel>
      {searches.map((search, index) => (
        <ComboboxItem key={search} value={{ kind: 'history', value: search } satisfies HistoryEntry} className="group/recent justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <SearchRowIcon>
              <HistoryIcon className="text-muted-foreground size-4 shrink-0" />
            </SearchRowIcon>
            <span className="truncate font-medium">{search}</span>
          </div>
          <div className="flex items-center">
            <span className="text-faint-foreground mx-3 text-xs max-sm:hidden">{index}</span>
            <SearchRecentRemoveButton onRemove={() => onRemove(search)} />
          </div>
        </ComboboxItem>
      ))}
    </ComboboxGroup>
  );
}
