import { dialoger, type InternalDialog } from '~/modules/common/dialoger/use-dialoger';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { OverlayCloseContext } from '~/modules/common/overlay-close';
import { useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';
import { cn } from '~/utils/cn';

export function DialogerDrawer({ dialog }: { dialog: InternalDialog }) {
  const { id, content, open, description, title, titleContent = title, className, headerClassName } = dialog;

  const isDropdownOpen = useDropdowner((state) => !!state.dropdown);

  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(
    () => dialoger.getState().hide(dialog.id),
    () => dialoger.getState().remove(dialog.id),
  );

  return (
    <Drawer open={open} disablePointerDismissal={isDropdownOpen} onOpenChange={closeDialog} onOpenChangeComplete={onOpenChangeComplete}>
      <DrawerContent id={String(id)} data-overlay="dialog" className={className}>
        {/* Above a confirmation's rows the question alone heads the sheet, as in a menu's confirmation; the title it repeats stays for screen readers */}
        {title && (
          <DrawerHeader sticky className={cn(description && 'group-has-data-[slot=drawer-row-group]/drawer-content:sr-only', headerClassName)}>
            <DrawerTitle className="min-w-0 truncate">{titleContent}</DrawerTitle>
          </DrawerHeader>
        )}
        {description && (
          <DrawerDescription className="group-has-data-[slot=drawer-row-group]/drawer-content:text-foreground px-3 pb-6 group-has-data-[slot=drawer-row-group]/drawer-content:pt-4 group-has-data-[slot=drawer-row-group]/drawer-content:text-balance">
            {description}
          </DrawerDescription>
        )}
        <div className="px-3 pb-3">
          <OverlayCloseContext.Provider value={{ close: closeDialog, back: closeDialog, drawer: true }}>{content}</OverlayCloseContext.Provider>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
