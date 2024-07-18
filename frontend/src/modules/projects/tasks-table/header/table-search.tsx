import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import { useRef, useEffect, useContext } from 'react';
import { Search, XCircle } from 'lucide-react';
import { Input } from '~/modules/ui/input';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';

export function TableSearch({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { isFilterActive } = useContext(TableFilterBarContext);
  const { setSelectedTasks, searchQuery, setSearchQuery } = useWorkspaceStore();
  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  // Focus input when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <div className="relative flex w-full sm:min-w-44 items-center" onClick={handleClick} onKeyDown={undefined}>
      <Search size={16} className="absolute left-3" style={{ opacity: `${searchQuery.length ? 1 : 0.5}` }} />
      <Input
        placeholder={t('common:placeholder.search')}
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0"
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => {
          const searchValue = e.target.value;
          if (searchValue.length) setSelectedTasks([]);
          setSearchQuery(searchValue);
        }}
      />
      {!!searchQuery.length && (
        <XCircle
          size={16}
          className="absolute right-8 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={() => setSearchQuery('')}
        />
      )}
      {children}
    </div>
  );
}
