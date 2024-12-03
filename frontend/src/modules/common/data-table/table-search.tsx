import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { Input } from '~/modules/ui/input';

const TableSearch = ({ value = '', setQuery }: { value?: string; setQuery: (value: string) => void }) => {
  const { t } = useTranslation();
  const { isFilterActive } = useContext(TableFilterBarContext);

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(value);

  const debouncedQuery = useDebounce(inputValue, 250);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!debouncedQuery) return;
    setQuery(debouncedQuery);
  }, [debouncedQuery]);

  useEffect(() => {
    if (value !== '') return;
    setInputValue('');
  }, [value]);

  // Focus input when filter button clicked (mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <div className="relative flex w-full sm:min-w-44 md:min-w-56 lg:min-w-64 items-center" onClick={handleClick} onKeyDown={handleClick}>
      <Search size={16} className="absolute left-3 top-3" style={{ opacity: inputValue ? 1 : 0.5 }} />
      <Input
        placeholder={t('common:placeholder.search')}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)} // Update local state directly
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0 pr-8"
        ref={inputRef}
      />
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
