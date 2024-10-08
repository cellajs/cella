import type { SheetProp } from '~/modules/common/sheeter/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { sheet as sheetState } from './state';

export default function MobileSheet({ sheet, removeSheet }: SheetProp) {
  const { modal = true, side = 'right', description, title, className, content, open } = sheet;

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    sheetState.update(sheet.id, { open });
    if (!open) closeSheet();
  };

  return (
    <Drawer modal={modal} open={open} onOpenChange={onOpenChange} onClose={closeSheet} direction={side} noBodyStyles>
      <DrawerContent onEscapeKeyDown={closeSheet} direction={side} className={className}>
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{title}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light pb-4${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
