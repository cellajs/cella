import { useIsFetching } from '@tanstack/react-query';
import { XCircleIcon } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

interface TableSearchProps {
  name: string;
  value?: string;
  allowOfflineSearch?: boolean;
  setQuery: (value: string) => void;
}

export function TableSearch({ name, value = '', allowOfflineSearch = false, setQuery }: TableSearchProps) {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();
  const { isFilterActive } = useContext(TableFilterBarContext);
  const tableFetchingCount = useIsFetching();

  const { focusRef: inputRef, setFocus } = useFocusByRef({ trigger: isFilterActive, delay: 50 });
  const [inputValue, setInputValue] = useState(value);

  const isSearching = tableFetchingCount > 0 && !!inputValue.length;
  const debouncedQuery = useDebounce(inputValue, 250);

  // Update parent query only when debouncedQuery changes
  useEffect(() => {
    if (debouncedQuery !== value) setQuery(debouncedQuery);
  }, [debouncedQuery]);

  // Reset input value when the external value changes
  useEffect(() => {
    if (!inputRef.current || document.activeElement !== inputRef.current) setInputValue(value);
  }, [value]);

  return (
    <InputGroup className="w-full border-0 shadow-none focus-visible:ring-offset-0">
      <InputGroupInput
        className="pl-0!"
        disabled={!isOnline && !allowOfflineSearch}
        placeholder={t('common:placeholder.search')}
        name={name}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        ref={inputRef}
        aria-label={t('common:placeholder.search')}
      />

      {/* Search Spinner */}
      <InputGroupAddon className="pl-1.5">
        <SearchSpinner value={inputValue} isSearching={isSearching} />
      </InputGroupAddon>

      {/* Clear Button */}
      <InputGroupAddon className="max-sm:hidden pr-2" align="inline-end">
        <XCircleIcon
          size={16}
          className={cn('opacity-70 hover:opacity-100 cursor-pointer', inputValue.length ? 'visible' : 'invisible')}
          onClick={() => {
            setInputValue('');
            setQuery('');
            setFocus();
          }}
        />
      </InputGroupAddon>
    </InputGroup>
  );
}
