import { useIsFetching } from '@tanstack/react-query';
import { useContext } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { SearchField } from '~/modules/common/search-field';

interface TableSearchProps {
  name: string;
  /** Names what the list holds, as "Search organizations": the placeholder and the accessible name. */
  label: string;
  value?: string;
  allowOfflineSearch?: boolean;
  onSearch: (value: string) => void;
}

export function TableSearch({ name, label, value = '', allowOfflineSearch = false, onSearch }: TableSearchProps) {
  const isOnline = useOnlineManager();
  const { isFilterActive } = useContext(TableFilterBarContext);
  const appFetchingCount = useIsFetching();

  return (
    <SearchField
      name={name}
      label={label}
      value={value}
      onSearch={onSearch}
      // The bar's own edge frames this field
      className="edgeless"
      disabled={!isOnline && !allowOfflineSearch}
      isSearching={appFetchingCount > 0 && !!value}
      // On a phone's open search the search key only lowers the keyboard; the list already follows the typing
      onKeyDown={(event) => {
        if (event.key === 'Enter' && isFilterActive) event.currentTarget.blur();
      }}
    />
  );
}
