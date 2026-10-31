import { useIsFetching } from '@tanstack/react-query';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { SearchField } from '~/modules/common/search-field';

interface TableSearchProps {
  name: string;
  /** Names what the list holds, as "Search organizations": the placeholder and the accessible name. */
  label: string;
  value?: string;
  /** What the search finds, as "4 tasks". */
  count?: string;
  allowOfflineSearch?: boolean;
  onSearch: (value: string) => void;
}

export function TableSearch({ name, label, value = '', count = '', allowOfflineSearch = false, onSearch }: TableSearchProps) {
  const isOnline = useOnlineManager();
  const isMobile = useBreakpointBelow('sm');
  const appFetchingCount = useIsFetching();

  return (
    <SearchField
      name={name}
      label={label}
      value={value}
      count={count}
      onSearch={onSearch}
      // The bar's own edge frames this field
      className="edgeless"
      disabled={!isOnline && !allowOfflineSearch}
      isSearching={appFetchingCount > 0 && !!value}
      // On a phone the search key only lowers the keyboard; the list already follows the typing
      onKeyDown={(event) => {
        if (event.key === 'Enter' && isMobile) event.currentTarget.blur();
      }}
    />
  );
}
