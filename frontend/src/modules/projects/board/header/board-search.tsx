import { useNavigate } from '@tanstack/react-router';
import { Search, XCircle } from 'lucide-react';
import React, { useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { Input } from '~/modules/ui/input';
import { useWorkspaceStore } from '~/store/workspace';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';

const BoardSearch = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { searchQuery, setSearchQuery, setSelectedTasks } = useWorkspaceStore();
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const { isFilterActive } = useContext(TableFilterBarContext);
  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  useMemo(() => {
    if (!debouncedSearchQuery.length) return;
    const q = debouncedSearchQuery;
    navigate({ search: (prev) => ({ ...prev, q }) });
  }, [debouncedSearchQuery]);

  // Focus input when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  return (
    <>
      <div className="relative flex w-full sm:min-w-44 items-center " onClick={handleClick} onKeyDown={undefined}>
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
            className="absolute right-3 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
            onClick={() => setSearchQuery('')}
          />
        )}
      </div>
    </>
  );
};

export default BoardSearch;
