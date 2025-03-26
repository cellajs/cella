import type { SheetProps } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { useDropdowner } from '../dropdowner/use-dropdowner';

export const MobileSheet = ({ sheet }: SheetProps) => {
  const { modal = true, id, side, description, title, titleContent = title, className, content, open = true } = sheet;

  const updateSheet = useSheeter.getState().update;

  // Check if dropdown is open, then disable dismissible
  const isDropdownOpen = useDropdowner((state) => state.dropdown);

  const closeSheet = () => {
    useSheeter.getState().remove(sheet.id);
    sheet.removeCallback?.();
  };

  const onOpenChange = (open: boolean) => {
    updateSheet(sheet.id, { open });
    if (!open) closeSheet();
  };

  return (
    <Drawer
      key={id}
      modal={modal}
      open={open}
      dismissible={!isDropdownOpen}
      onOpenChange={onOpenChange}
      onClose={closeSheet}
      direction={side}
      noBodyStyles
    >
      <DrawerContent id={String(id)} onEscapeKeyDown={closeSheet} direction={side} className={className}>
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{titleContent}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light ${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
};
