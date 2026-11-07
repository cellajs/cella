import { useRef } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { dialoger, type InternalDialog } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { OverlayCloseContext } from '~/modules/common/overlay-close';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus, useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { searchDialogLayout } from '~/modules/common/search-dialog-bar';
import { sheetLayerOf } from '~/modules/common/sheeter/sheet-layer';
import { spotlightLift, useSpotlight } from '~/modules/common/spotlighter/use-spotlighter';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

export function DialogerDialog({ dialog }: { dialog: InternalDialog }) {
  const { id, open, description, title, titleContent = title, outsideScroll = false, className, searchLayout, dock, layer } = dialog;

  // A container renders the dialog inline: the page keeps scrolling, and takes pointer input unless `overlay` dims it; focus stays in the dialog.
  // A phone has no room beside the form, so it fills the screen there.
  const isMobile = useBreakpointBelow('sm');
  const container = isMobile ? undefined : dialog.container;
  const containerElement = isMobile ? undefined : dialog.containerElement;
  const inline = !!container;

  const removeDialog = () => dialoger.getState().remove(dialog.id);

  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(() => dialoger.getState().hide(dialog.id), removeDialog);

  // URL-driven dialogs remove in the same tick, so the exit animation cannot reopen them
  const dismiss = dialog.instantClose ? removeDialog : closeDialog;

  const handleOpenChange = (_nextOpen: boolean, eventDetails: OverlayCloseDetails) => {
    if (eventDetails.reason === 'escape-key' && isHoverContentOpen()) return;
    if (eventDetails.reason === 'outside-press' && (isDropdownOpen() || inline)) return;
    dismiss();
  };

  const popupRef = useRef<HTMLDivElement>(null);

  useSpotlight(`dialog-${id}`, !!open && !!container?.overlay, dismiss, sheetLayerOf(containerElement));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} onOpenChangeComplete={onOpenChangeComplete} modal={inline ? 'trap-focus' : true}>
      <DialogContent
        ref={popupRef}
        id={String(id)}
        container={containerElement}
        {...{ layer, outsideScroll, dock }}
        viewportClassName={searchLayout ? searchDialogLayout.viewportClassName : undefined}
        overlayClassName={searchLayout ? searchDialogLayout.overlayClassName : undefined}
        className={cn(className, searchLayout && searchDialogLayout.className, containerElement && (container?.overlay ? spotlightLift : 'z-40'))}
        initialFocus={() => touchInitialFocus(popupRef)}
        finalFocus={() => finalFocusFor(dialog.triggerRef, String(id))}
      >
        {title && (
          // Inline, the page has no padding: top-4 keeps the stuck header off the window's edge
          <DialogHeader sticky closeButton={!dock} className={cn(dock && 'justify-center', dialog.headerClassName, inline && 'sm:top-4')}>
            <DialogTitle className="h-6 min-w-0 truncate leading-6">{titleContent}</DialogTitle>
          </DialogHeader>
        )}
        {description && <DialogDescription className={cn(dock && 'text-center')}>{description}</DialogDescription>}
        <OverlayCloseContext.Provider value={{ close: dismiss, back: dismiss }}>{dialog.content}</OverlayCloseContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
