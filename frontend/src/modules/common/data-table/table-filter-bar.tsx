import { FunnelXIcon, SearchIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
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

export const TableFilterBarContext = createContext<{ isFilterActive: boolean }>({ isFilterActive: false });

/** Actions section that fades out and slides left on mobile while the filter is active. */
export function FilterBarActions({ children, className = '' }: FilterBarChildProps) {
  const { isFilterActive } = useContext(TableFilterBarContext);

  return (
    <motion.div
      animate={{ opacity: isFilterActive ? 0 : 1, x: isFilterActive ? -20 : 0 }}
      transition={{ duration: 0.15 }}
      className={cn('flex items-center gap-3 max-sm:shrink-0', className, isFilterActive && 'max-sm:pointer-events-none')}
    >
      {children}
    </motion.div>
  );
}

interface FilterBarPartProps extends FilterBarChildProps {
  /** Placement and stacking of the phone overlay. */
  overlayClassName: string;
  /** Horizontal offset in px the phone overlay slides in from. */
  slideX?: number;
}

/** A phone overlay shown while the filter is active, and an always-visible copy from sm up. */
function FilterBarPart({ overlayClassName, slideX = 0, className, children }: FilterBarPartProps) {
  const { isFilterActive } = useContext(TableFilterBarContext);

  return (
    <>
      <AnimatePresence>
        {isFilterActive && (
          <motion.div
            initial={{ opacity: 0, x: slideX }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideX }}
            transition={{ duration: 0.15 }}
            className={cn('absolute inset-y-0 right-12 flex items-center gap-2 sm:hidden', overlayClassName, className)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
      <div className={cn('hidden items-center gap-2 sm:flex', className)}>{children}</div>
    </>
  );
}

/** Search input container: fades in over the actions on mobile; always visible on desktop. */
export function FilterBarSearch(props: FilterBarChildProps) {
  return <FilterBarPart {...props} overlayClassName="left-0 z-10" />;
}

/** Filter controls (non-search): slide in from the right on mobile; always visible on desktop. */
export function FilterBarFilters(props: FilterBarChildProps) {
  return <FilterBarPart {...props} overlayClassName="z-20" slideX={20} />;
}

/** Filter bar container; children are absolutely positioned so the mobile toggle can animate them. */
export function TableFilterBar({ onResetFilters, isFiltered, children }: TableFilterBarProps) {
  const { t } = useTranslation();
  const isDesktop = useBreakpointAbove('sm');

  const [isFilterActive, setFilterActive] = useState<boolean>(!!isFiltered);

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
    <div className="flex w-full items-center gap-2 max-sm:relative max-sm:flex-1">
      <TableFilterBarContext.Provider value={{ isFilterActive: effectiveFilterActive }}>{children}</TableFilterBarContext.Provider>

      <Button
        variant="secondary"
        size="icon"
        onClick={toggleFilter}
        aria-label={isFilterActive ? t('c:cancel') : t('c:search')}
        className="relative ml-auto size-10 sm:hidden"
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
              {isFiltered ? <FunnelXIcon /> : <XIcon />}
            </motion.span>
          ) : (
            <motion.span
              key="search"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.8, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.15 }}
            >
              <SearchIcon />
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </div>
  );
}
