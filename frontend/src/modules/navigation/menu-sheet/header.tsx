import { Link } from '@tanstack/react-router';
import { ArrowLeftIcon, SearchIcon, Settings2Icon, XCircleIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusByRef } from '~/hooks/use-focus-by-ref';
import { useMountedState } from '~/hooks/use-mounted-state';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Logo } from '~/modules/common/logo';
import { SearchSpinner } from '~/modules/common/search-spinner';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { navSheetClassName } from '~/modules/navigation/app-nav';
import { openPreferencesSheet } from '~/modules/navigation/open-preferences-sheet';
import { Button } from '~/modules/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '~/modules/ui/input-group';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

// Class to hide actions in keep-nav-open mode, revealing on hover/focus/dropdown
const keepOpenFadeClass =
  'group-[.keep-nav-open]/body:opacity-0 group-[.keep-nav-open]/body:group-hover/menu:opacity-100 group-[.keep-nav-open]/body:group-focus-within/menu:opacity-100 group-[.keep-nav-open]/body:group-has-data-[state=open]/actions:opacity-100';

interface Props {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  isSearchActive: boolean;
  setSearchActive: (active: boolean) => void;
}

/**
 * Combined header with logo, search toggle, and preferences.
 * Animates between header state and expanded search input.
 * Also renders floating-nav return bar (visible only in floating-nav context).
 */
export const MenuSheetHeader = ({ searchTerm, setSearchTerm, isSearchActive, setSearchActive }: Props) => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const { hasStarted } = useMountedState();
  const { focusRef: inputRef, setFocus } = useFocusByRef({ trigger: isSearchActive, delay: 50 });
  const preferencesRef = useRef<HTMLButtonElement | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement | null>(null);

  const toggleSearch = () => {
    setSearchTerm(isSearchActive ? '' : searchTerm);
    setSearchActive(!isSearchActive);
  };

  const openAccount = () => {
    setNavSheetOpen('account');
    useSheeter.getState().create(<AccountSheet />, {
      id: 'nav-sheet',
      triggerRef: accountButtonRef,
      side: 'left',
      showCloseButton: false,
      modal: false,
      className: navSheetClassName,
      onClose: () => setNavSheetOpen(null),
    });
  };

  return (
    <>
      {/* Only visible when floating nav is present. To return to home */}
      <div id="return-nav" className="in-[.floating-nav]:flex hidden gap-2">
        <Button variant="ghost" className="justify-start h-10 grow" asChild>
          <Link to="/home">
            <ArrowLeftIcon size={16} strokeWidth={1.5} />
            <span className="ml-2 font-normal">Home</span>
          </Link>
        </Button>
        <Button
          ref={preferencesRef}
          size="icon"
          variant="ghost"
          onClick={() => openPreferencesSheet(preferencesRef)}
          className="w-10 px-1.5 shrink-0 h-10"
        >
          <Settings2Icon size={20} strokeWidth={1.5} />
        </Button>
        {user && (
          <Button ref={accountButtonRef} size="icon" variant="ghost" onClick={openAccount} className="w-10 px-1.5 h-10">
            <AvatarWrap className="h-8 w-8" type="user" id={user.id} name={user.name} url={user.thumbnailUrl} />
          </Button>
        )}
      </div>

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
              <InputGroup className="h-full border-0 bg-transparent shadow-none focus-visible:ring-offset-0">
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
                    className={cn(!searchTerm && 'hidden')}
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
              <TooltipButton toolTipContent={isSearchActive ? t('common:cancel') : t('common:search')} side="left">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSearch}
                  aria-label={isSearchActive ? t('common:cancel') : t('common:search')}
                  className={cn(
                    'size-10 relative transition-opacity',
                    !hasStarted && 'opacity-0!',
                    !isSearchActive && keepOpenFadeClass,
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
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                      >
                        <SearchIcon size={16} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </TooltipButton>
            </motion.div>

            {/* Preferences button - slides right and fades out when search is active */}
            <motion.div
              animate={{ x: isSearchActive ? 20 : 0, opacity: isSearchActive ? 0 : 1 }}
              transition={{ duration: 0.2 }}
              className={isSearchActive ? 'pointer-events-none' : ''}
            >
              <TooltipButton toolTipContent={t('common:preferences')} side="right" sideOffset={22}>
                <Button
                  ref={preferencesRef}
                  variant="ghost"
                  size="icon"
                  onClick={() => openPreferencesSheet(preferencesRef)}
                  className={cn('size-10 transition-opacity', !hasStarted && 'opacity-0!')}
                  aria-label={t('common:preferences')}
                >
                  <Settings2Icon size={16} />
                </Button>
              </TooltipButton>
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
};
