import { useNavigate } from '@tanstack/react-router';
import { Search, XCircle } from 'lucide-react';
import React, { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import router from '~/lib/router';
import { Input } from '~/modules/ui/input';
import { useWorkspaceStore } from '~/store/workspace';
import { TableFilterBarContext } from '../../../common/data-table/table-filter-bar';

const BoardSearch = () => {
  const { t } = useTranslation();
  const { searchQuery, setSearchQuery, setSelectedTasks } = useWorkspaceStore();
  const { isFilterActive } = useContext(TableFilterBarContext);
  const navigate = useNavigate();

  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  useEffect(() => {
    const currentPath = router.state.location.pathname;
    const boardOnTableView = currentPath.endsWith('/table');
    const q = searchQuery.length > 0 && boardOnTableView ? searchQuery : undefined;

    navigate({ to: currentPath, search: (prev) => ({ ...prev, q }) });
  }, [searchQuery]);

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
