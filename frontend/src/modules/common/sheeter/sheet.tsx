import StickyBox from '~/modules/common/sticky-box';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '~/modules/ui/sheet';
import type { SheetT } from './state';

export interface SheetProp {
  sheet: SheetT;
  removeSheet: () => void;
}

export default function DesktopSheet({ sheet, removeSheet }: SheetProp) {
  const { modal = true, side = 'right', description, title, hideClose = true, className, content } = sheet;

  const handleClose = (state: boolean) => {
    if (!state) {
      removeSheet();
      sheet.removeCallback?.();
    }
  };

  return (
    <Sheet open={true} onOpenChange={handleClose} modal={modal}>
      <SheetContent
        onEscapeKeyDown={removeSheet}
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
