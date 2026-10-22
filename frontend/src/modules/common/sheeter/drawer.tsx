import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

const sideToSwipeDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' } as const;

export function SheeterDrawer({ sheet, onExited }: { sheet: InternalSheet; onExited?: () => void }) {
  // Drawers on mobile are always modal (overlay + outside click to close)
  const { id, side, description, title, titleContent = title, headerClassName, className, content, contentKey, keepMounted, open = true } = sheet;

  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  return (
    <Drawer
      modal
      open={open}
      disablePointerDismissal={isDropdownOpen}
      swipeDirection={sideToSwipeDirection[side]}
      // The provider keeps the removed drawer rendered until it has slid out
      onOpenChange={() => sheeter.getState().remove(sheet.id)}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
    >
      <DrawerContent id={String(id)} className={className} keepMounted={keepMounted}>
        {(title || description) && (
          <DrawerHeader sticky className={headerClassName}>
            {title && <DrawerTitle>{titleContent}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </DrawerContent>
    </Drawer>
  );
}
