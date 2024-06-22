import type { VariantProps } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useKeyPress } from '~/hooks/use-key-press';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { Sheet, SheetContent } from '~/modules/ui/sheet';
import type { sheetVariants } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';

type SheetSideType = VariantProps<typeof sheetVariants>['side'];

const NavSheet = () => {
  const isMobile = useBreakpoints('max', 'sm');
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [sheetSide, setSheetSide] = useState<SheetSideType>('left');

  // Close sheet when user presses ESC
  const onKeyPress = () => {
    const isFocusedWithin = containerRef?.current?.contains(document.activeElement as Node);
    if (isFocusedWithin && activeSheet) setSheet(null, 'force');
  };

  useKeyPress('Escape', onKeyPress);

  const hideShadow = keepMenuOpen && activeSheet?.id === 'menu';
  const sheetClass = `${
    hideShadow ? 'xl:shadow-none' : ''
  } h-[calc(100%-16)] max-w-md sm:max-w-xs duration-300 ease-in-out p-0 sm:left-16 sm:top-0 z-[130] sm:z-[85] data-[state=closed]:duration-300 data-[state=open]:duration-300 overflow-hidden`;

  useEffect(() => {
    if (!activeSheet) return;
    setSheetSide(activeSheet.mirrorOnMobile ? 'mirrorOnMobile' : 'left');
  }, [activeSheet]);

  return (
    <Sheet open={!!activeSheet} modal={false}>
      {isMobile && !!activeSheet && (
        <div
          onClick={() => setSheet(null, 'force')}
          onKeyDown={() => {}}
          className="fixed inset-0 z-[100] sm:z-[80] bg-background/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
      )}
      <SheetContent side={sheetSide} ref={containerRef} className={sheetClass}>
        <ScrollArea className="h-full" id="nav-sheet">
          <div className="p-4">{activeSheet?.sheet}</div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export { NavSheet };
