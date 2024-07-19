import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '~/store/workspace';
import { useRef, useEffect, useContext, useMemo, useState } from 'react';
import { Search, XCircle, SlidersHorizontal } from 'lucide-react';
import { Input } from '~/modules/ui/input';
import { useDebounce } from '~/hooks/use-debounce';
import { TableFilterBarContext } from '~/modules/common/data-table/table-filter-bar';

export function TableSearch({
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

  useMemo(() => {
    const q = debouncedSearchQuery;
    setSearchQuery(q);
    navigate({ search: (prev) => ({ ...prev, q }) });
  }, [debouncedSearchQuery]);

  // Focus input when filter button clicked(mobile)
  useEffect(() => {
    if (isFilterActive) inputRef.current?.focus();
  }, [isFilterActive]);

  useEffect(() => {
    if (innerSearchQuery !== searchQuery) setInnerSearchQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!inputRef.current?.contains(target) && !dropdownRef.current?.contains(target)) setIsFocused(false);
    };
    const handleFocus = () => {
      if (document.activeElement === inputRef.current) setIsFocused(true);
    };
    const inputElement = inputRef.current;
    if (inputElement) inputElement.addEventListener('focus', handleFocus);

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      if (inputElement) inputElement.removeEventListener('focus', handleFocus);
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  return (
    <div className="relative flex w-full sm:min-w-44 items-center" onClick={handleClick} onKeyDown={undefined}>
      <Search size={16} className="absolute left-3" style={{ opacity: `${innerSearchQuery.length ? 1 : 0.5}` }} />
      <Input
        placeholder={t('common:placeholder.search')}
        style={{ paddingLeft: '2rem' }}
        className="h-10 w-full border-0"
        ref={inputRef}
        value={innerSearchQuery}
        onChange={(e) => {
          if (e.target.value.length && selectedTasks.length) setSelectedTasks([]);
          setInnerSearchQuery(e.target.value);
        }}
      />
      {!!innerSearchQuery.length && (
        <XCircle
          size={16}
          className="absolute right-8 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer"
          onClick={() => setInnerSearchQuery('')}
        />
      )}
      {isFocused && <SlidersHorizontal className="absolute right-2 top-1/2 opacity-70 hover:opacity-100 -translate-y-1/2 cursor-pointer h-4 w-4" />}
      {isFocused && (
        <div className="top-12  absolute w-full" ref={dropdownRef}>
          {children}
        </div>
      )}
    </div>
  );
}
