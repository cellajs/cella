import { Search, XCircle } from 'lucide-react';
import { useContext, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '~/modules/ui/input';
import { TableFilterBarContext } from './table-filter-bar';

const TableSearch = ({ value = '', setQuery }: { value?: string; setQuery: (value: string) => void }) => {
  const { t } = useTranslation();
  const { isFilterActive } = useContext(TableFilterBarContext);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  // Focus input  when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 lg:min-w-56 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search size={16} className="relative left-7 top-2 transform -translate-y-1/2" style={{ opacity: value ? 1 : 0.5 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          value={value}
          onChange={(event) => setQuery(event.target.value)}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full"
          ref={inputRef}
        />
        {!!value.length && (
          <XCircle
            size={16}
            className="absolute right-3 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
            onClick={() => setQuery('')}
          />
        )}
      </div>
    </>
  );
};

export default TableSearch;
