import { Sheet, SheetContent } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { useKeyPress } from '~/hooks/use-key-press';
import { useRef } from 'react';

const NavSheet = () => {
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useKeyPress('Escape', onKeyPress);

  function onKeyPress() {
    const isFocusedWithin = containerRef?.current?.contains(document.activeElement as Node);
    if (isFocusedWithin && activeSheet) setSheet(null);
  }

  const isMirrorSide = activeSheet?.mirrorOnMobile;
  const hideShadow = keepMenuOpen && activeSheet?.id === 'menu';
  const sheetClass = `${
    hideShadow ? 'lg:shadow-none' : ''
  } top-16 h-[calc(100%-16)] duration-300 ease-in-out md:left-16 md:top-0 z-30 data-[state=closed]:duration-300 data-[state=open]:duration-300`;

  return (
    <div>
      <Sheet open={!!activeSheet} modal={false}>
        <SheetContent
          side={isMirrorSide ? 'mirrorOnMobile' : 'left'}
          ref={containerRef}
          className={sheetClass}
          id="nav-sheet"
          onClick={() => setSheet(null)}
        >
          {activeSheet?.sheet}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export { NavSheet };
