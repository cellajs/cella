import { useRef } from 'react';
import { dialoger, type InternalDialog } from '~/modules/common/dialoger/use-dialoger';
import { isDropdownOpen } from '~/modules/common/dropdowner/use-dropdowner';
import { OverlayCloseContext } from '~/modules/common/overlay-close';
import { finalFocusFor, type OverlayCloseDetails, touchInitialFocus, useRemoveAfterExit } from '~/modules/common/overlay-store-helpers';
import { sheetLayerOf } from '~/modules/common/sheeter/sheet-layer';
import { spotlightLift, useSpotlight } from '~/modules/common/spotlighter/use-spotlighter';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';
import { tw } from '~/utils/tw';

// A phone's search dialog: at the top below the safe area, inset 0.5rem on every side, its height filling the space
// above the keyboard (--visual-viewport-height, which SearchDialogBar writes), or above the bottom safe area while the
// keyboard is closed. A flex column, so the results fill and scroll while the field stays.
const searchLayoutClass = tw(
  'max-sm:data-closed:slide-out-to-top-2 max-sm:data-open:slide-in-from-top-2 max-sm:mt-[max(0.5rem,env(safe-area-inset-top))] max-sm:mb-0 max-sm:flex max-sm:h-[calc(min(var(--visual-viewport-height,100dvh)-0.5rem,100dvh-max(0.5rem,env(safe-area-inset-bottom)))-max(0.5rem,env(safe-area-inset-top)))] max-sm:max-h-none max-sm:w-[calc(100%-1rem)] max-sm:flex-col max-sm:self-start max-sm:overflow-hidden max-sm:rounded-xl max-sm:ring-0',
);

interface DialogerDialogProps {
  dialog: InternalDialog;
}

export function DialogerDialog({ dialog }: DialogerDialogProps) {
  const {
    id,
    content,
    open,
    triggerRef,
    description,
    title,
    titleContent = title,
    outsideScroll = false,
    className,
    headerClassName,
    container,
    searchLayout,
    dock,
  } = dialog;

  // A container renders the dialog inline: the page keeps scrolling, and takes pointer input unless `overlay` dims it; focus stays in the dialog
  const inline = !!container;
  const containerElement = container?.ref?.current ?? undefined;

  const removeDialog = () => dialoger.getState().remove(dialog.id);

  // The dialog animates out before its entry (and onClose) is removed.
  const { close: closeDialog, onOpenChangeComplete } = useRemoveAfterExit(() => dialoger.getState().update(dialog.id, { open: false }), removeDialog);

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
        layer={dock ? sheetLayerOf(triggerRef.current) : null}
        outsideScroll={outsideScroll}
        dock={dock}
        // A drag on the inset around a search dialog would scroll the page under it: iOS scroll lock fails once its toolbar has collapsed.
        viewportClassName={searchLayout ? 'max-sm:touch-none' : undefined}
        className={cn(className, searchLayout && searchLayoutClass, containerElement && (container?.overlay ? spotlightLift : 'z-40'))}
        initialFocus={touchInitialFocus(popupRef)}
        finalFocus={finalFocusFor(triggerRef, String(id))}
      >
        {/* An empty header would overlap the content, e.g. in the fullscreen attachment dialog */}
        {(title || description) && (
          <DialogHeader sticky className={dock ? 'text-center' : headerClassName}>
            {title && <DialogTitle className="h-6 leading-6">{titleContent}</DialogTitle>}
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
        )}
        <OverlayCloseContext.Provider value={{ close: dismiss, back: dismiss }}>{content}</OverlayCloseContext.Provider>
      </DialogContent>
    </Dialog>
  );
}
