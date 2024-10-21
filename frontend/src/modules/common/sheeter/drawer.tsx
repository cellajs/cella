import { useEffect, useState } from 'react';
import type { SheetProp } from '~/modules/common/sheeter/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { sheet as sheetState } from './state';

export default function MobileSheet({ sheet, removeSheet }: SheetProp) {
  const { modal = true, side: sheetSide, description, title, interactWithPortalElements, className: sheetClassName, content, open } = sheet;

  const modalState = interactWithPortalElements ? false : modal;

  // State to retain side value even after sheet removal
  const [side, setSide] = useState(sheetSide);
  const [className, setClassName] = useState(sheetClassName);

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    sheetState.update(sheet.id, { open });
    if (!open) closeSheet();
  };

  // Prevent flickering of sheet when its removed
  useEffect(() => {
    if (sheetSide) {
      setSide(sheetSide); // Update side when new sheet is created
      setClassName(sheetClassName);
    }
  }, [sheetSide, sheetClassName]);

  return (
    <Drawer modal={modalState} open={open} onOpenChange={onOpenChange} onClose={closeSheet} direction={side} noBodyStyles>
      {/* If interactWithPortalElements is set to true, you also need to pass an onClick function to close the drawer. */}
      <DrawerContent
        interactWithPortalElements={interactWithPortalElements}
        closeDrawer={closeSheet}
        onEscapeKeyDown={closeSheet}
        direction={side}
        className={className}
      >
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{title}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light pb-4${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
