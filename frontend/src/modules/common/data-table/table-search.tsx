import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { Input } from '~/modules/ui/input';

interface TableSearchProps {
  value?: string;
  setQuery: (value: string) => void;
}

const TableSearch = ({ value = '', setQuery }: TableSearchProps) => {
  const { t } = useTranslation();
  const { isFilterActive } = useContext(TableFilterBarContext);

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);

  const debouncedQuery = useDebounce(inputValue, 250);

  const handleClick = () => inputRef.current?.focus();

  useEffect(() => {
    setQuery(debouncedQuery);
  }, [debouncedQuery]);

  // Reset input value when the external value changes
  useEffect(() => {
    if (!value) setInputValue('');
  }, [value]);

  // Focus input when filter button is active (for mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <div className="relative flex w-full sm:min-w-44 md:min-w-56 lg:min-w-64 items-center" onClick={handleClick} onKeyDown={handleClick}>
      <Search size={16} className="absolute left-3 top-3" style={{ opacity: inputValue ? 1 : 0.5 }} />
      <Input
        placeholder={t('common:placeholder.search')}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        ref={inputRef}
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0 pr-8"
        aria-label={t('common:placeholder.search')}
      />
      {/* Clear Button */}
      {!!inputValue.length && (
        <XCircle
          size={16}
          className="absolute right-3 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={() => setQuery('')}
        />
      )}
    </div>
  );
};

export default TableSearch;
