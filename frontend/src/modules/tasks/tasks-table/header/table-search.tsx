import { useNavigate } from '@tanstack/react-router';
import { Search, XCircle } from 'lucide-react';
import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '~/hooks/use-debounce';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { Input } from '~/modules/ui/input';
import { useWorkspaceStore } from '~/store/workspace';

export function TaskTableSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = useRef<HTMLInputElement>(null);
  const { isFilterActive } = useContext(TableFilterBarContext);
  const { selectedTasks, setSelectedTasks, searchQuery, setSearchQuery } = useWorkspaceStore();

  const [innerSearchQuery, setInnerSearchQuery] = useState(searchQuery);
  const debouncedSearchQuery = useDebounce(innerSearchQuery, 200);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  const handleEscKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    inputRef.current?.blur();
  };

  // Focus input when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  useEffect(() => {
    const q = debouncedSearchQuery;
    if (!q.length) {
      setSearchQuery('');
      navigate({
        to: '.',
        search: (prev) => {
          const { q, ...rest } = prev;
          return rest;
        },
      });
    } else {
      setSearchQuery(q);
      navigate({
        to: '.',
        search: (prev) => ({ ...prev, q }),
      });
    }
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (innerSearchQuery === searchQuery) return;
    setInnerSearchQuery(searchQuery);
  }, [searchQuery]);

  return (
    <div id="input-wrap" className="relative flex w-full sm:min-w-44 items-center" onClick={handleClick} onKeyDown={undefined}>
      <Search size={16} className="absolute left-3" style={{ opacity: `${innerSearchQuery.length ? 1 : 0.5}` }} />
      <Input
        id="table-search"
        placeholder={t('common:placeholder.search')}
        ref={inputRef}
        className="h-10 w-full border-0 pr-8 pl-8"
        autoComplete="off"
        value={innerSearchQuery}
        onKeyDown={handleEscKeyPress}
        onChange={(e) => {
          if (e.target.value.length && selectedTasks.length) setSelectedTasks([]);
          setInnerSearchQuery(e.target.value);
        }}
      />
      {!!innerSearchQuery.length && (
        <XCircle
          size={16}
          className="absolute right-2 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setInnerSearchQuery('');
          }}
        />
      )}
    </div>
  );
}
