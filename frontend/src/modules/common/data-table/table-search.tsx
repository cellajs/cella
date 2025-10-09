import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';

interface TableSearchProps {
  name: string;
  value?: string;
  allowOfflineSearch?: boolean;
  setQuery: (value: string) => void;
}

const TableSearch = ({ name, value = '', allowOfflineSearch = false, setQuery }: TableSearchProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();
  const { isFilterActive } = useContext(TableFilterBarContext);

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);

  const debouncedQuery = useDebounce(inputValue, 250);

  // Update parent query only when debouncedQuery changes
  useEffect(() => {
    if (debouncedQuery !== value) setQuery(debouncedQuery);
  }, [debouncedQuery]);

  // Reset input value when the external value changes
  useEffect(() => {
    if (!inputRef.current || document.activeElement !== inputRef.current) setInputValue(value);
  }, [value]);

  // Focus input when filter button is active (for mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <InputGroup>
      <InputGroupInput
        disabled={!isOnline && !allowOfflineSearch}
        placeholder={t('common:placeholder.search')}
        name={name}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        ref={inputRef}
        className="h-10 w-full border-0 shadow-none focus-visible:ring-offset-0"
        aria-label={t('common:placeholder.search')}
      />
      <InputGroupAddon className="pl-1.5">
        <Search size={16} style={{ opacity: inputValue ? 1 : 0.5 }} />
      </InputGroupAddon>

      {/* Clear Button */}
      {!!inputValue.length && (
        <InputGroupAddon className="pr-2" align="inline-end">
          <XCircle
            size={16}
            className="opacity-70 hover:opacity-100 cursor-pointer"
            onClick={() => {
              setInputValue('');
              setQuery('');
            }}
          />
        </InputGroupAddon>
      )}
    </InputGroup>
  );
};

export default TableSearch;
