import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

const AppSheet = () => {
  const navigate = useNavigate();
  const { activeSheet, setSheet, getMenu, keepMenuOpen } = useNavigationStore();
  const { getMe } = useUserStore();

  const isMirrorSide = activeSheet?.mirrorOnMobile;
  const hideShadow = keepMenuOpen && activeSheet?.id === 'menu';
  const sheetClass = `${
    hideShadow ? 'lg:shadow-none' : ''
  } top-16 h-[calc(100%-16)] duration-300 ease-in-out md:left-16 md:top-0 z-30 data-[state=closed]:duration-300 data-[state=open]:duration-300`;

  // TODO: Move to loader somehow or refactor? Get menu and update user on mount only. After fresh auth, getMe is called twice.
  useEffect(() => {
    getMenu();
    getMe()
      .then(() => {})
      .catch(() => {
        navigate({ to: '/sign-out' });
      });
  }, []);

  return (
    <Sheet open={!!activeSheet} modal={false}>
      <SheetContent side={isMirrorSide ? 'mirrorOnMobile' : 'left'} className={sheetClass} onClick={() => setSheet(null)}>
        {activeSheet?.sheet}
      </SheetContent>
    </Sheet>
  );
};

export { AppSheet };
