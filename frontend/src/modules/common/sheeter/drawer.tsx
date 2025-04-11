import type { SheetProps } from '~/modules/common/sheeter/sheet';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export const MobileSheet = ({ sheet }: SheetProps) => {
  const { modal = true, id, side, description, title, titleContent = title, className, content, open = true } = sheet;

  const updateSheet = useSheeter.getState().update;

  // onClose trigger handles by remove method
  const closeSheet = () => useSheeter.getState().remove(sheet.id);

  const onOpenChange = (open: boolean) => {
    updateSheet(sheet.id, { open });
    if (!open) closeSheet();
  };

  return (
    // dismissible false to prevent close of sheet on dialog close
    <Drawer key={id} modal={modal} open={open} dismissible={false} direction={side} noBodyStyles onOpenChange={onOpenChange} onClose={closeSheet}>
      <DrawerContent id={String(id)} onEscapeKeyDown={closeSheet} direction={side} className={className}>
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{titleContent}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light ${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {/* To allow y scroll in drawer */}
        <div className="overflow-y-auto">{content}</div>
      </DrawerContent>
    </Drawer>
  );
};
