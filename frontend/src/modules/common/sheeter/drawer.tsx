import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { cn } from '~/utils/cn';

const sideToSwipeDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' } as const;

interface SheeterDrawerProps {
  sheet: InternalSheet;
  onExited?: () => void;
}

export function SheeterDrawer({ sheet, onExited }: SheeterDrawerProps) {
  const { id, side, description, title, titleContent = title, headerClassName, className, content, contentKey, keepMounted, open = true } = sheet;

  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  return (
    <Drawer
      // Always modal on mobile: an overlay, and an outside press closes it
      modal
      open={open}
      disablePointerDismissal={isDropdownOpen}
      swipeDirection={sideToSwipeDirection[side]}
      onOpenChange={() => sheeter.getState().remove(sheet.id)}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
    >
      <DrawerContent id={String(id)} className={className} keepMounted={keepMounted}>
        {/* The header takes the `container` inset of the content below, so both share one left edge */}
        {(title || description) && (
          <DrawerHeader sticky className={cn('px-3 sm:px-4', headerClassName)}>
            {title && <DrawerTitle>{titleContent}</DrawerTitle>}
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
        )}
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </DrawerContent>
    </Drawer>
  );
}
