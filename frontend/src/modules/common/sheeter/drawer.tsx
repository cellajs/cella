import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { finalFocusFor } from '~/modules/common/overlay-store-helpers';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { isTouchInteraction } from '~/utils/input-modality';

const sideToSwipeDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' } as const;

interface SheeterDrawerProps {
  sheet: InternalSheet;
  onExited?: () => void;
}

export function SheeterDrawer({ sheet, onExited }: SheeterDrawerProps) {
  const {
    id,
    side,
    triggerRef,
    description,
    title,
    titleContent = title,
    titleAside,
    headerClassName,
    className,
    content,
    contentKey,
    keepMounted,
    open = true,
  } = sheet;

  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  return (
    <Drawer
      modal
      open={open}
      disablePointerDismissal={isDropdownOpen}
      swipeDirection={sideToSwipeDirection[side]}
      onOpenChange={() => sheeter.getState().remove(sheet.id)}
      onOpenChangeComplete={(isOpen) => !isOpen && onExited?.()}
    >
      {/* Touch keeps Base UI's default: focusing a trigger out of view would scroll the page under the finger */}
      <DrawerContent
        id={String(id)}
        className={className}
        keepMounted={keepMounted}
        finalFocus={() => isTouchInteraction() || finalFocusFor(triggerRef, String(id))}
      >
        {/* p-3 and px-3 match the `container` inset of the content below */}
        {title && (
          <DrawerHeader sticky closeButton={side === 'left' || side === 'right'} className={headerClassName}>
            <DrawerTitle className="h-6 min-w-0 truncate leading-6">{titleContent}</DrawerTitle>
            {titleAside}
          </DrawerHeader>
        )}
        {description && <DrawerDescription className="px-3 pb-4">{description}</DrawerDescription>}
        <ContentKeyTransition contentKey={contentKey}>{content}</ContentKeyTransition>
      </DrawerContent>
    </Drawer>
  );
}
