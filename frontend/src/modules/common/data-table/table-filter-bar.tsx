import { FilterXIcon, SearchIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

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

/**
 * Actions section that fades out and slides left on mobile when filter is active.
 */
export const FilterBarActions = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);

  return (
    <motion.div
      animate={{ opacity: isFilterActive ? 0 : 1, x: isFilterActive ? -20 : 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'flex items-center gap-3 max-sm:shrink-0',
        className,
        isFilterActive && 'max-sm:pointer-events-none',
      )}
    >
      {children}
    </motion.div>
  );
};

/**
 * Search input container with simple fade animation on mobile.
 * Absolutely positioned to fill left side, overlaying actions.
 * On desktop it's always visible.
 */
export const FilterBarSearch = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);

  return (
    <>
      {/* Mobile: absolutely positioned, fills left side */}
      <AnimatePresence>
        {isFilterActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn('sm:hidden flex items-center gap-2 absolute inset-y-0 left-0 right-12 z-10', className)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Desktop: always visible */}
      <div className={cn('hidden sm:flex items-center gap-2', className)}>{children}</div>
    </>
  );
};

/**
 * Filter controls that slide in from the right on mobile when filter is active.
 * Absolutely positioned on the right side, just before the toggle button.
 * On desktop it's always visible. Use this for filters other than search.
 */
export const FilterBarFilters = ({ children, className = '' }: FilterBarChildProps) => {
  const { isFilterActive } = useContext(TableFilterBarContext);

  return (
    <>
      {/* Mobile: absolutely positioned on right, slides in */}
      <AnimatePresence>
        {isFilterActive && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}
            className={cn('sm:hidden flex items-center gap-2 absolute inset-y-0 right-12 z-20', className)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      {/* Desktop: always visible */}
      <div className={cn('hidden sm:flex items-center gap-2', className)}>{children}</div>
    </>
  );
};

/**
 * @deprecated Use FilterBarSearch for search input or FilterBarFilters for other filters
 */
export const FilterBarContent = FilterBarFilters;

/**
 * Filter bar container with toggle button for mobile.
 * Uses absolute positioning pattern for smooth mobile animations.
 */
export const TableFilterBar = ({ onResetFilters, isFiltered, children }: TableFilterBarProps) => {
  const { t } = useTranslation();
  const isDesktop = useBreakpoints('min', 'sm');

  const [isFilterActive, setFilterActive] = useState<boolean>(!!isFiltered);

  // On desktop, filter toggle state is always inactive
  const effectiveFilterActive = isDesktop ? false : isFilterActive;

  const toggleFilter = () => {
    if (isFilterActive) {
      if (isFiltered) onResetFilters();
      setFilterActive(false);
    } else {
      setFilterActive(true);
    }
  };

  return (
    <div className="flex items-center max-sm:relative max-sm:flex-1 w-full">
      <TableFilterBarContext.Provider value={{ isFilterActive: effectiveFilterActive, setFilterActive }}>
        {children}
      </TableFilterBarContext.Provider>

      {/* Mobile toggle button - always on right, icon animates between search and X */}
      <Button
        variant="secondary"
        size="icon"
        onClick={toggleFilter}
        aria-label={isFilterActive ? t('common:cancel') : t('common:search')}
        className="sm:hidden size-10 relative ml-auto"
      >
        <AnimatePresence mode="wait">
          {isFilterActive ? (
            <motion.span
              key="close"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{ duration: 0.15 }}
            >
              {isFiltered ? <FilterXIcon size={16} /> : <XIcon size={16} />}
            </motion.span>
          ) : (
            <motion.span
              key="search"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.8, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              <SearchIcon size={16} />
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </div>
  );
};
