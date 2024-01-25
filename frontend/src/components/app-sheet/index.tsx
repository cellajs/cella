import { useEffect } from 'react';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

const AppSheet = () => {
  const { activeSheet, setSheet, getMenu } = useNavigationStore();
  const { getMe } = useUserStore();
  const isMirrorSide = activeSheet?.mirrorOnMobile;

  // TODO: Perhaps move or refactor? Get menu and update user on mount
  useEffect(() => {
    getMenu();
    getMe();
  }, []);

  return (
    <Sheet open={!!activeSheet} modal={false}>
      <SheetContent
        side={isMirrorSide ? 'mirrorOnMobile' : 'left'}
        className="top-16 h-[calc(100%-16)] duration-300 ease-in-out md:left-16 md:top-0 z-30 data-[state=closed]:duration-300 data-[state=open]:duration-300"
        onClick={() => setSheet(null)}
      >
        {activeSheet?.sheet}
      </SheetContent>
    </Sheet>
  );
};

export { AppSheet };
