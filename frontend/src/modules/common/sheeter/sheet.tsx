import { useBreakpoints } from '~/hooks/use-breakpoints';
import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import { useNavigationStore } from '~/store/navigation';
import { type SheetT, sheet as sheetState } from './state';
export interface SheetProp {
  sheet: SheetT;
  removeSheet: (sheet: SheetT) => void;
}

export default function DesktopSheet({ sheet, removeSheet }: SheetProp) {
  const { keepMenuOpen, navSheetOpen } = useNavigationStore();
  const isDesktop = useBreakpoints('min', 'xl');

  const { id, modal = true, side = 'right', open, description, title, hideClose = true, className, content } = sheet;

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    if (keepMenuOpen && isDesktop && id === 'nav-sheet' && navSheetOpen === 'menu') return;
    sheetState.update(id, { open });
    if (!open) closeSheet();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={modal}>
      <SheetContent
        onEscapeKeyDown={closeSheet}
        side={side}
        hideClose={hideClose}
        aria-describedby={undefined}
        className={`${className} items-start`}
      >
        <StickyBox className={`z-10 flex items-center justify-between bg-background py-4 ${title ? '' : 'hidden'}`}>
          <SheetTitle>{title}</SheetTitle>
        </StickyBox>
        <SheetHeader className={`${description || title ? '' : 'hidden'}`}>
          <SheetDescription className={`${description ? '' : 'hidden'}`}>{description}</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
