import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { Input } from '~/modules/ui/input';

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
      <div className="relative flex w-full sm:min-w-44 md:min-w-56 lg:min-w-64 items-center " onClick={handleClick} onKeyDown={undefined}>
        <Search size={16} className="absolute left-3 top-3" style={{ opacity: value ? 1 : 0.5 }} />
        <Input
          placeholder={t('common:placeholder.search')}
          value={value}
          onChange={(event) => setQuery(event.target.value)}
          style={{ paddingLeft: '2rem' }}
          className="h-10 w-full border-0"
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
