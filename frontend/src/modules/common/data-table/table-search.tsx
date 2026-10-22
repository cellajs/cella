import { useIsFetching } from '@tanstack/react-query';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { SearchClearButton } from '~/modules/common/search-clear-button';
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
  const isOnline = useOnlineManager();
  const { isFilterActive } = useContext(TableFilterBarContext);
  const appFetchingCount = useIsFetching();

  const { focusRef: inputRef, setFocus } = useFocusByRef({ trigger: isFilterActive, delay: 50 });
  const [inputValue, setInputValue] = useState(value);

  const isSearching = appFetchingCount > 0 && !!inputValue.length;
  const debouncedQuery = useDebounce(inputValue, 250);

  useEffect(() => {
    if (debouncedQuery !== value) setQuery(debouncedQuery);
  }, [debouncedQuery]);

  useEffect(() => {
    if (!inputRef.current || document.activeElement !== inputRef.current) setInputValue(value);
  }, [value]);

  return (
    // The bar's own edge frames this field, so it draws none of its own; under increased contrast it needs one.
    <InputGroup className="border-transparent more-contrast:border-input shadow-none">
      <InputGroupInput
        className="pl-0!"
        disabled={!isOnline && !allowOfflineSearch}
        placeholder={t('c:placeholder.search')}
        name={name}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        ref={inputRef}
        aria-label={t('c:placeholder.search')}
      />

      <InputGroupAddon className="pl-1.5">
        <SearchSpinner value={inputValue} isSearching={isSearching} />
      </InputGroupAddon>

      <InputGroupAddon className="pr-2 max-sm:hidden" align="inline-end">
        <SearchClearButton
          className={cn(!inputValue.length && 'invisible')}
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
