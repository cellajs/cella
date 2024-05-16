import { Filter, FilterX, X } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { Button } from '~/modules/ui/button';

import { useTranslation } from 'react-i18next';
import { cn, makeTransition } from '~/lib/utils';

interface TableFilterBarProps {
  children: React.ReactNode;
  isFiltered?: boolean;
  onResetFilters: () => void;
}

interface FilterBarChildProps {
  children: React.ReactNode;
  className?: string;
}

// Create a Context with default values
export const TableFilterBarContext = createContext<{
  isFilterActive: boolean;
  setFilterActive: (isActive: boolean) => void;
}>({
  isFilterActive: false,
  setFilterActive: () => {},
});

export const FilterBarActions = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);
  return <div className={cn('flex items-center gap-2', className, isFilterActive && 'max-sm:hidden')}>{children}</div>;
};

export const FilterBarContent = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);
  return (
    <div
      className={cn('flex items-center max-sm:w-full gap-2 max-sm:relative max-sm:-ml-2 max-sm:mr-2', className, !isFilterActive && 'max-sm:hidden')}
    >
      {children}
    </div>
  );
};

export const TableFilterBar = ({ onResetFilters, isFiltered, children }: TableFilterBarProps) => {
  const { t } = useTranslation();

  const [isFilterActive, setFilterActiveWithoutTransition] = useState<boolean>(!!isFiltered);

  const setFilterActive = (active: boolean) => {
    makeTransition(() => setFilterActiveWithoutTransition(active));
  };

  const clearFilters = () => {
    if (isFiltered) return onResetFilters();
    setFilterActive(false);
  };

  return (
    <>
      <TableFilterBarContext.Provider value={{ isFilterActive, setFilterActive }}>{children}</TableFilterBarContext.Provider>
      {!isFilterActive && (
        <Button
          style={{
            viewTransitionName: 'table-filter-bar-button',
          }}
          className="sm:hidden"
          variant="secondary"
          onClick={() => setFilterActive(true)}
        >
          <Filter
            style={{
              viewTransitionName: 'table-filter-bar-icon',
            }}
            width={16}
            height={16}
          />
          <span className="ml-1">{t('common:filter')}</span>
        </Button>
      )}
      {isFilterActive && (
        <Button
          style={{
            viewTransitionName: 'table-filter-bar-button',
          }}
          className="sm:hidden"
          variant="secondary"
          onClick={clearFilters}
        >
          {isFiltered ? (
            <FilterX
              style={{
                viewTransitionName: 'table-filter-bar-icon',
              }}
              size={16}
            />
          ) : (
            <X
              size={16}
              style={{
                viewTransitionName: 'table-filter-bar-icon',
              }}
            />
          )}
        </Button>
      )}
    </>
  );
};
