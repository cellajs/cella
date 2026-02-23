import { Link } from '@tanstack/react-router';
import { SearchIcon, XCircleIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useMountedState } from '~/hooks/use-mounted-state';
import { Logo } from '~/modules/common/logo';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { UserTheme } from '~/modules/me/user-theme';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { cn } from '~/utils/cn';

interface Props {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;
}

/**
 * Combined header with logo, search toggle, and theme switcher.
 * Animates between header state and expanded search input.
 */
export const MenuSheetHeader = ({ searchTerm, setSearchTerm, isSearchActive, setSearchActive }: Props) => {
  const { t } = useTranslation();
  const { hasWaited, hasStarted } = useMountedState();
  const { focusRef: inputRef, setFocus } = useFocusByRef({ trigger: isSearchActive, delay: 50 });

  const toggleSearch = () => {
    if (isSearchActive) {
      setSearchTerm('');
      setSearchActive(false);
    } else {
      setSearchActive(true);
    }
  };

  return (
    <div className="in-[.floating-nav]:hidden relative h-10">
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
                    setFocus();
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

        <div className="flex items-center gap-2 group/actions">
          {/* Search toggle button - icon animates between search and X */}
          <motion.div animate={{ x: isSearchActive ? 48 : 0 }} transition={{ duration: 0.2 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSearch}
              aria-label={isSearchActive ? t('common:cancel') : t('common:search')}
              className={cn(
                'size-10 relative transition-opacity',
                !hasWaited && 'opacity-0!',
                !isSearchActive &&
                  'group-[.keep-nav-open]/body:opacity-0 group-[.keep-nav-open]/body:group-hover/menu:opacity-100 group-[.keep-nav-open]/body:group-focus-within/menu:opacity-100 group-[.keep-nav-open]/body:group-has-data-[state=open]/actions:opacity-100',
              )}
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
            <UserTheme
              contentClassName="z-140"
              buttonClassName={cn(
                'size-10 transition-opacity',
                !hasWaited && 'opacity-0!',
                !isSearchActive &&
                  'group-[.keep-nav-open]/body:opacity-0 group-[.keep-nav-open]/body:group-hover/menu:opacity-100 group-[.keep-nav-open]/body:group-focus-within/menu:opacity-100 group-[.keep-nav-open]/body:data-[state=open]:opacity-100',
              )}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
};
