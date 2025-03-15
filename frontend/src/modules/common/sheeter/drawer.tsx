import { useEffect, useState } from 'react';
import type { SheetProps } from '~/modules/common/sheeter/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { useSheeter } from './use-sheeter';

export const MobileSheet = ({ sheet, removeSheet }: SheetProps) => {
  const { modal = true, id, side: sheetSide, description, title, titleContent = title, className: sheetClassName, content, open } = sheet;

  const updateSheet = useSheeter.getState().update;

  // State to retain side value even after sheet removal
  const [side, setSide] = useState(sheetSide);
  const [className, setClassName] = useState(sheetClassName);

  // Prevent flickering of sheet when its removed
  useEffect(() => {
    if (sheetSide) {
      setSide(sheetSide); // Update side when new sheet is created
      setClassName(sheetClassName);
    }
  }, [sheetSide, sheetClassName]);

  const closeSheet = () => {
    removeSheet(sheet);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    updateSheet(sheet.id, { open });
    if (!open) closeSheet();
  };

  return (
    <Drawer key={id} modal={modal} open={open} onOpenChange={onOpenChange} onClose={closeSheet} direction={side} noBodyStyles>
      <DrawerContent id={String(id)} onEscapeKeyDown={closeSheet} direction={side} className={className}>
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{titleContent}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light pb-4${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
};
