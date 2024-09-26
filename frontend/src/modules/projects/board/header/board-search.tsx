import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { Input } from '~/modules/ui/input';
import { useWorkspaceStore } from '~/store/workspace';

const BoardSearch = ({ toggleFocus }: { toggleFocus: () => void }) => {
  const { t } = useTranslation();
  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = useRef<HTMLInputElement>(null);
  const { isFilterActive } = useContext(TableFilterBarContext);
  const { selectedTasks, setSelectedTasks, searchQuery, setSearchQuery } = useWorkspaceStore();

  const handleClick = () => {
    inputRef.current?.focus();
  };

  const filters = useMemo(
    () => ({
      q: searchQuery,
    }),
    [searchQuery],
  );
  useSaveInSearchParams(filters);

  // Focus input when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <div className="relative flex w-full sm:min-w-44 items-center" onClick={handleClick} onKeyDown={undefined}>
      <Search size={16} className="absolute left-3" style={{ opacity: `${searchQuery.length ? 1 : 0.5}` }} />
      <Input
        onFocus={toggleFocus}
        onBlur={toggleFocus}
        placeholder={t('common:placeholder.search')}
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0 pr-10"
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => {
          const searchValue = e.target.value;
          if (searchValue.length && selectedTasks.length) setSelectedTasks([]);
          setSearchQuery(searchValue);
        }}
      />
      {!!searchQuery.length && (
        <XCircle
          size={16}
          className="absolute right-4 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={() => setSearchQuery('')}
        />
      )}
    </div>
  );
};

export default BoardSearch;
