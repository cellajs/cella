import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { ContentKeyTransition } from '~/modules/common/sheeter/sheet';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { cn } from '~/utils/cn';

const sideToSwipeDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' } as const;

export function SheeterDrawer({ sheet }: { sheet: InternalSheet }) {
  // Drawers on mobile are always modal (overlay + outside click to close)
  const { id, side, description, title, titleContent = title, headerClassName, className, content, contentKey, open = true } = sheet;

  const updateSheet = sheeter.getState().update;

  const isDropdownOpen = useDropdowner((state) => state.dropdown);

  // The drawer slides out before its entry is removed; onClose still runs as the close starts.
  const { close: closeSheet, onOpenChangeComplete } = useRemoveAfterExit(
    () => {
      updateSheet(sheet.id, { open: false, onClose: undefined });
      sheet.onClose?.();
    },
    () => sheeter.getState().remove(sheet.id),
  );

  const onOpenChange = (open: boolean) => {
    if (open) updateSheet(sheet.id, { open });
    else closeSheet();
  };

  return (
    <Drawer
      key={id}
      modal
      open={open}
      disablePointerDismissal={!!isDropdownOpen}
      swipeDirection={sideToSwipeDirection[side]}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DrawerContent id={String(id)} className={className}>
        <DrawerHeader sticky className={cn(headerClassName, !(description || title) && 'hidden')}>
          {title && <DrawerTitle className="font-medium">{titleContent}</DrawerTitle>}
          {description && <DrawerDescription className="text-muted-foreground">{description}</DrawerDescription>}
        </DrawerHeader>
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </DrawerContent>
    </Drawer>
  );
}
