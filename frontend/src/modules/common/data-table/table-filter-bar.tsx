import { FilterX, Search, X } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { Button } from '~/modules/ui/button';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';
import { nanoid } from '~/utils/nanoid';

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
  return <div className={cn('flex items-center gap-3', className, isFilterActive && 'max-sm:hidden')}>{children}</div>;
};

export const FilterBarContent = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);
  return (
    <div className={cn('flex items-center max-sm:w-full gap-2 max-sm:relative max-sm:mr-2', className, !isFilterActive && 'max-sm:hidden')}>
      {children}
    </div>
  );
};

export const TableFilterBar = ({ onResetFilters, isFiltered, children }: TableFilterBarProps) => {
  const { t } = useTranslation();

  const key = nanoid();

  const [isFilterActive, setFilterActive] = useState<boolean>(!!isFiltered);

  const clearFilters = () => {
    if (isFiltered) return onResetFilters();
    setFilterActive(false);
  };

  return (
    <>
      <TableFilterBarContext.Provider value={{ isFilterActive, setFilterActive }}>{children}</TableFilterBarContext.Provider>
      <AnimatePresence>
        {!isFilterActive && (
          <Button className="sm:hidden" variant="secondary" onClick={() => setFilterActive(true)} asChild>
            <motion.button key={key} layoutId={`table-filter-bar-button-${key}`}>
              <motion.span layoutId={`table-filter-bar-icon-${key}`}>
                <Search width={16} height={16} />
              </motion.span>
              <motion.span
                className="ml-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                {t('common:search')}
              </motion.span>
            </motion.button>
          </Button>
        )}
        {isFilterActive && (
          <Button className="sm:hidden" variant="secondary" onClick={clearFilters} asChild>
            <motion.button key={key} layoutId="table-filter-bar-button">
              <motion.span layoutId="table-filter-bar-icon">{isFiltered ? <FilterX size={16} /> : <X size={16} />}</motion.span>
            </motion.button>
          </Button>
        )}
      </AnimatePresence>
    </>
  );
};
