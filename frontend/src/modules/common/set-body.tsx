import { useEffect, useRef } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useNavigationStore } from '~/store/navigation';

export const SetBody = () => {
  const { navSheetOpen, setKeepMenuOpen, keepOpenPreference } = useNavigationStore();
  const isDesktop = useBreakpoints('min', 'xl', true);

  // useRef to store the previous value of navSheetOpen
  const prevSheetRef = useRef<string | null>(null);

  // Update the previous sheet when navSheetOpen changes
  useEffect(() => {
    if (navSheetOpen !== prevSheetRef.current) {
      prevSheetRef.current = navSheetOpen;
    }
  }, [navSheetOpen]);

  // Determine if the menu should stay open
  const shouldKeepMenuOpen = isDesktop && keepOpenPreference && (navSheetOpen === 'menu' || prevSheetRef.current === 'menu');

  // Maintain keep menu open state to use elsewhere
  useEffect(() => {
    setKeepMenuOpen(shouldKeepMenuOpen);
  }, [shouldKeepMenuOpen]);

  // Apply body classes for menu state
  useBodyClass({
    'keep-menu-open': shouldKeepMenuOpen,
    'menu-sheet-open': navSheetOpen === 'menu',
    'nav-sheet-open': !!navSheetOpen,
  });

  return null;
};
