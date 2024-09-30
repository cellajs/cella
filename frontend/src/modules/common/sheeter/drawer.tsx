import type { SheetProp } from '~/modules/common/sheeter/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export default function MobileSheet({
  direction = 'bottom',
  title,
  description,
  content,
  className,
  onOpenChange,
}: SheetProp & { direction?: 'top' | 'bottom' | 'right' | 'left' }) {
  return (
    <Drawer open={true} direction={direction} noBodyStyles onOpenChange={onOpenChange}>
      <DrawerContent direction={direction} className={className}>
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{title}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light pb-4${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
