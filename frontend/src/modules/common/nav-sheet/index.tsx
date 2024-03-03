import { Sheet, SheetContent } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';

const NavSheet = () => {
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore();

  const isMirrorSide = activeSheet?.mirrorOnMobile;
  const hideShadow = keepMenuOpen && activeSheet?.id === 'menu';
  const sheetClass = `${
    hideShadow ? 'lg:shadow-none' : ''
  } top-16 h-[calc(100%-16)] duration-300 ease-in-out md:left-16 md:top-0 z-30 data-[state=closed]:duration-300 data-[state=open]:duration-300`;

  return (
    <Sheet open={!!activeSheet} modal={false}>
      <SheetContent side={isMirrorSide ? 'mirrorOnMobile' : 'left'} className={sheetClass} onClick={() => setSheet(null)}>
        {activeSheet?.sheet}
      </SheetContent>
    </Sheet>
  );
};

export { NavSheet };
