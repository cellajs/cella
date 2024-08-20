import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import { useRef, useEffect, useContext, useState } from 'react';
import { Search, XCircle, ListCollapse } from 'lucide-react';
import { Input } from '~/modules/ui/input';
import { useDebounce } from '~/hooks/use-debounce';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';
import { useEventListener } from '~/hooks/use-event-listener';

export function TaskTableSearch({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Reference with `useRef` to persist the same ref object during re-renders
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { isFilterActive } = useContext(TableFilterBarContext);
  const { selectedTasks, setSelectedTasks, searchQuery, setSearchQuery } = useWorkspaceStore();
  const [isFocused, setIsFocused] = useState(false);

  const [innerSearchQuery, setInnerSearchQuery] = useState(searchQuery);
  const debouncedSearchQuery = useDebounce(innerSearchQuery, 200);

  const handleClick = () => {
    inputRef.current?.focus();
  };

  const handleEscKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    inputRef.current?.blur();
    setIsFocused(false);
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
        search: (prev) => {
          const { q, ...rest } = prev;
          return rest;
        },
      });
    } else {
      setSearchQuery(q);
      navigate({ search: (prev) => ({ ...prev, q }) });
    }
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (innerSearchQuery === searchQuery) return;
    setInnerSearchQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const wrapper = document.getElementById('input-wrap');
      const target = event.target as Node;
      if (!wrapper?.contains(target) && !dropdownRef.current?.contains(target)) setIsFocused(false);
    };
    const inputElement = inputRef.current;
    if (inputElement) inputElement.addEventListener('focus', () => setIsFocused(true));
    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      if (inputElement) inputElement.removeEventListener('focus', () => setIsFocused(true));
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  useEventListener('searchDropDownClose', () => setIsFocused(false));

  return (
    <div id="input-wrap" className="relative flex w-full sm:min-w-44 items-center" onClick={handleClick} onKeyDown={undefined}>
      <Search size={16} className="absolute left-3" style={{ opacity: `${innerSearchQuery.length ? 1 : 0.5}` }} />
      <Input
        id="table-search"
        placeholder={t('common:placeholder.search')}
        ref={inputRef}
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0 pr-14"
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
          className="absolute right-8 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setIsFocused(false);
            setInnerSearchQuery('');
          }}
        />
      )}
      {isFocused && (
        <>
          <ListCollapse className="absolute right-2 top-1/2 opacity-100 -translate-y-1/2 h-4 w-4" />
          <div className="top-12  absolute w-full" ref={dropdownRef}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
