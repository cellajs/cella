import { Link } from '@tanstack/react-router';
import { appConfig } from 'config';
import { SearchIcon, XCircleIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useMounted from '~/hooks/use-mounted';
import Logo from '~/modules/common/logo';
import { SearchSpinner } from '~/modules/common/search-spinner';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import UserTheme from '~/modules/me/user-theme';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

interface MenuSheetSearchProps {
  menu: UserMenu;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResultsChange: (results: UserMenuItem[]) => void;
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;
  className?: string;
}

/**
 * Combined header with logo, search toggle, and theme switcher.
 * Animates between header state and expanded search input.
 */
export const MenuSheetHeader = ({
  menu,
  searchTerm,
  setSearchTerm,
  searchResultsChange,
  isSearchActive,
  setSearchActive,
  className,
}: MenuSheetSearchProps) => {
  const { t } = useTranslation();
  const { hasStarted } = useMounted();
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter search results
  useEffect(() => {
    const filterResults = () => {
      if (!searchTerm.trim()) return [];

      const lowerCaseTerm = searchTerm.toLowerCase();

      const filterItems = (items: UserMenuItem[]): UserMenuItem[] =>
        items.flatMap((item) => {
          const isMatch = item.name.toLowerCase().includes(lowerCaseTerm);
          const filteredSubmenu = item.submenu ? filterItems(item.submenu) : [];
          return isMatch ? [item, ...filteredSubmenu] : filteredSubmenu;
        });

      return appConfig.menuStructure.flatMap(({ entityType }) => filterItems(menu[entityType]));
    };
    searchResultsChange(filterResults());
  }, [searchTerm, menu]);

  // Focus input when search becomes active
  useEffect(() => {
    if (isSearchActive && inputRef.current) {
      // Small delay to ensure animation has started
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isSearchActive]);

  const toggleSearch = () => {
    if (isSearchActive) {
      setSearchTerm('');
      setSearchActive(false);
    } else {
      setSearchActive(true);
    }
  };

  return (
    <div className={cn('in-[.floating-nav]:hidden relative h-10', className)}>
      {/* Search input - absolutely positioned, fades in/out */}
      <AnimatePresence>
        {isSearchActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 right-12 z-10"
          >
            <InputGroup className="h-full border-0 shadow-none focus-visible:ring-offset-0">
              <InputGroupInput
                className="pl-0!"
                id="nav-sheet-search"
                ref={inputRef}
                disabled={!hasStarted}
                type="text"
                placeholder={t('common:placeholder.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onBlur={() => {
                  if (!searchTerm) setSearchActive(false);
                }}
                aria-label={t('common:placeholder.search')}
              />
              <InputGroupAddon className="pl-1.5">
                <SearchSpinner value={searchTerm} isSearching={false} />
              </InputGroupAddon>
              <InputGroupAddon className="pr-2" align="inline-end">
                <XCircleIcon
                  size={16}
                  className={cn('opacity-70 hover:opacity-100 cursor-pointer', !searchTerm && 'hidden')}
                  onClick={() => {
                    setSearchTerm('');
                    inputRef.current?.focus();
                  }}
                />
              </InputGroupAddon>
            </InputGroup>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between h-10">
        {/* Logo - fades out when search is active */}
        <motion.div
          animate={{ opacity: isSearchActive ? 0 : 1, x: isSearchActive ? -10 : 0 }}
          transition={{ duration: 0.15 }}
          className={isSearchActive ? 'pointer-events-none' : ''}
        >
          <Link
            to="/about"
            target="_blank"
            draggable="false"
            className="hover:scale-105 transition-transform active:translate-y-[.05rem] block rounded-md focus-effect"
          >
            <Logo height={34} className="mx-1.5" />
          </Link>
        </motion.div>

        <div className="flex items-center gap-2">
          {/* Search toggle button - icon animates between search and X */}
          <motion.div animate={{ x: isSearchActive ? 48 : 0 }} transition={{ duration: 0.2 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSearch}
              aria-label={isSearchActive ? t('common:cancel') : t('common:search')}
              className="size-10 relative"
            >
              <AnimatePresence mode="wait">
                {isSearchActive ? (
                  <motion.span
                    key="close"
                    initial={{ opacity: 0, rotate: -90 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.15 }}
                  >
                    <XIcon size={18} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="search"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 0.8, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.15 }}
                  >
                    <SearchIcon size={18} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </motion.div>

          {/* Theme button - slides to the right and fades out when search is active */}
          <motion.div
            animate={{ x: isSearchActive ? 20 : 0, opacity: isSearchActive ? 0 : 1 }}
            transition={{ duration: 0.2 }}
            className={isSearchActive ? 'pointer-events-none' : ''}
          >
            <UserTheme contentClassName="z-140" buttonClassName="size-10" />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
