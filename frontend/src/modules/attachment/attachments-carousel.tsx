import { useNavigate } from '@tanstack/react-router';
import Autoplay from 'embla-carousel-autoplay';
import i18n from 'i18next';
import { ChevronUpIcon, DownloadIcon, ExternalLinkIcon, InfoIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { textFromDocument } from 'shared/blocknote';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { useDownloader } from '~/hooks/use-downloader';
import { useLatestCallback, useLatestRef } from '~/hooks/use-latest-ref';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { attachmentDialogParam, attachmentDialogStageClassName, clearAttachmentDialogSearchParams } from '~/modules/attachment/dialog/params';
import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
import type { PendingUpload } from '~/modules/attachment/helpers/pending-uploads';
import { AttachmentRender } from '~/modules/attachment/render/attachment-render';
import { CloseButton } from '~/modules/common/close-button';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import {
  Carousel as BaseCarousel,
  type CarouselApi,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/modules/ui/carousel';
import { DialogTitle } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

export type CarouselItemData = {
  id: string;
  url: string;
  name?: string;
  filename?: string;
  /** Renderer choice: a BlockNote block type ('image', 'video') or a MIME type, matched by substring. */
  contentType?: string;
  convertedContentType?: string | null;
  /** URL is a local blob object URL, which fails the CDN check the toolbar buttons rely on. */
  isLocal?: boolean;
  /** Stored description blocks; the dialog shows its text as a caption. */
  description?: string | null;
  /** The file is still only on its uploader's device: the slide shows whose, with no url. */
  pendingUpload?: PendingUpload;
};

interface CarouselPropsBase {
  items: CarouselItemData[];
  itemIndex?: number;
  classNameContainer?: string;
}

type CarouselProps =
  | (CarouselPropsBase & { isDialog: true; saveInSearchParams: boolean })
  | (CarouselPropsBase & { isDialog?: false; saveInSearchParams?: never });

export function AttachmentsCarousel({ items, isDialog = false, itemIndex = 0, saveInSearchParams = false, classNameContainer }: CarouselProps) {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);
  const { download, isInProgress } = useDownloader();

  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [watchDrag, setWatchDrag] = useState(items.length > 1);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  // The slide Embla shows, kept by id so a change in the item set keeps it.
  const [selectedId, setSelectedId] = useState<string | undefined>(items[itemIndex]?.id);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const currentItemIndex = selectedIndex === -1 ? itemIndex : selectedIndex;
  const currentItem = items[currentItemIndex] ?? null;
  // Editing lives in the attachments table; the dialog only shows the text, so the toggle needs something to show.
  const descriptionText = textFromDocument(currentItem?.description);

  // Embla restarts on `startIndex` whenever its options change, so it moves only with the item count and the drag toggle.
  const [start, setStart] = useState({ index: currentItemIndex, count: items.length });
  if (start.count !== items.length) setStart({ index: currentItemIndex, count: items.length });

  const selectSlide = (item: CarouselItemData | undefined) => {
    if (item) setSelectedId(item.id);
    if (!saveInSearchParams) return;

    if (!item) {
      clearAttachmentDialogSearchParams();
      removeDialog();
      return;
    }

    navigate({ to: '.', replace: true, resetScroll: false, search: (prev) => ({ ...prev, [attachmentDialogParam]: item.id }) });
  };

  const toggleWatchDrag = (enabled: boolean) => {
    setWatchDrag(enabled && items.length > 1);
    setStart({ index: currentItemIndex, count: items.length });
  };

  // Slides stay still for a reader who asked for reduced motion, who gets the control to start them; everyone else gets
  // slides that hold while the pointer or the keyboard is on them and carry on once it leaves.
  const reducedMotion = useReducedMotion();
  const apiRef = useRef<CarouselApi>(undefined);
  const [autoplaying, setAutoplaying] = useState(false);
  const toggleAutoplay = () => {
    const autoplay = apiRef.current?.plugins().autoplay;
    if (autoplaying) autoplay?.stop();
    else autoplay?.play();
  };

  // The carousel calls setApi once per Embla instance, so the listeners read the latest items and handler.
  const itemsRef = useLatestRef(items);
  const handleSelect = useLatestCallback(selectSlide);
  const handleSetApi = (api: CarouselApi) => {
    if (!api) return;
    api.on('select', () => handleSelect(itemsRef.current[api.selectedScrollSnap()]));

    // The plugin emits before it flips its own flag, so the event names the new state and `isPlaying()` only seeds it.
    apiRef.current = api;
    api.on('autoplay:play', () => setAutoplaying(true)).on('autoplay:stop', () => setAutoplaying(false));
    setAutoplaying(api.plugins().autoplay?.isPlaying() ?? false);
  };

  if (!items.length || !currentItem) return null;

  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: start.index, watchDrag }}
      plugins={
        isDialog
          ? []
          : [
              Autoplay({
                delay: 4000,
                stopOnInteraction: !!reducedMotion,
                stopOnMouseEnter: true,
                playOnInit: !reducedMotion,
                // The arrows and dots sit beside Embla's viewport: hover is read on the carousel around all three
                rootNode: (viewport) => viewport.parentElement,
              }),
            ]
      }
      className="group size-full"
      setApi={handleSetApi}
    >
      {/* z-20 matches the zoom controls: at z-10 the viewer, a flex item with the same index, paints over the title. */}
      {isDialog && (
        <div className="fixed top-0 left-0 z-20 flex w-full flex-col bg-background/60 p-3 backdrop-blur-xs">
          <div className="flex w-full gap-2 text-center sm:text-left">
            {/* The visible name is the dialog's accessible name; with no name, a screen-reader-only title labels it. */}
            {currentItem.name ? (
              <DialogTitle className="ml-1 flex h-6 min-w-0 items-center gap-2 truncate text-base leading-6 tracking-tight max-sm:text-sm">
                {currentItem.contentType && <FilePlaceholder contentType={currentItem.contentType} className="size-4 shrink-0" strokeWidth={2} />}
                <span className="truncate">{currentItem.name}</span>
              </DialogTitle>
            ) : (
              <DialogTitle className="sr-only">{currentItem.filename || i18n.t('c:attachment')}</DialogTitle>
            )}
            {descriptionText && (
              <Button
                variant="ghost"
                size="icon"
                aria-expanded={descriptionOpen}
                aria-label={i18n.t('c:description')}
                className="-my-1 size-8 shrink-0 opacity-70 hover:opacity-100"
                press={false}
                onClick={() => setDescriptionOpen(!descriptionOpen)}
              >
                <span className="relative size-5">
                  <InfoIcon
                    className={cn(
                      'absolute inset-0 size-5 transition-all duration-200 motion-reduce:transition-none',
                      descriptionOpen ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100',
                    )}
                    strokeWidth={1.5}
                  />
                  <ChevronUpIcon
                    className={cn(
                      'absolute inset-0 size-5 transition-all duration-200 motion-reduce:transition-none',
                      descriptionOpen ? 'rotate-0 opacity-100' : '-rotate-90 opacity-0',
                    )}
                    strokeWidth={1.5}
                  />
                </span>
              </Button>
            )}
            <div className="grow" />
            {isCDNUrl(currentItem.url) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={i18n.t('c:open')}
                className="-my-1 size-8 opacity-70 hover:opacity-100"
                onClick={() => window.open(currentItem.url, '_blank')}
              >
                <ExternalLinkIcon className="size-5" strokeWidth={1.5} />
              </Button>
            )}

            {/* Download also handles blob URLs; open-in-new-tab stays CDN-only since top-level blob navigation is browser-dependent. */}
            {(isCDNUrl(currentItem.url) || currentItem.isLocal) && (
              <Button
                variant="ghost"
                size="icon"
                disabled={isInProgress}
                aria-label={i18n.t('c:download')}
                className="-my-1 size-8 opacity-70 hover:opacity-100"
                onClick={() => download(currentItem.url, currentItem.filename || 'file')}
              >
                {isInProgress ? <Spinner className="size-5 text-foreground/80" noDelay /> : <DownloadIcon className="size-5" strokeWidth={1.5} />}
              </Button>
            )}

            <CloseButton onClick={() => removeDialog()} size="lg" className="-my-1" />
          </div>
          {/* Collapsed by default; expands like a form label's help text. */}
          {descriptionText && (
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none',
                descriptionOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
              )}
            >
              <div
                className={cn(
                  'overflow-hidden transition-opacity duration-200 motion-reduce:transition-none',
                  descriptionOpen ? 'opacity-100' : 'opacity-0',
                )}
              >
                <p className="mt-2 ml-1 max-w-3xl text-muted-foreground text-sm max-sm:mx-auto">{descriptionText}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <CarouselContent className="h-full">
        {items.map(({ id, url, name, filename, contentType = 'image', convertedContentType, pendingUpload }, idx) => {
          return (
            <CarouselItem
              key={id}
              onClick={() => {
                if (isDialog) return;
                openAttachmentDialog({ attachmentIndex: idx, attachments: items, triggerRef: nextButtonRef });
              }}
            >
              <AttachmentRender
                containerClassName={cn(
                  'relative flex h-full items-center justify-center overflow-hidden',
                  isDialog && attachmentDialogStageClassName,
                  classNameContainer,
                )}
                itemClassName={isDialog ? 'object-contain' : ''}
                type={convertedContentType || contentType}
                imagePanZoom={isDialog}
                showButtons={currentItemIndex === idx}
                url={url}
                pendingUpload={pendingUpload}
                filename={filename}
                alt={name || filename || i18n.t('c:attachment')}
                onPanStateToggle={toggleWatchDrag}
                onBackdropClick={isDialog ? () => removeDialog() : undefined}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>

      {items.length > 1 && (
        <>
          {/* Solid on every backdrop: the slide behind can be any image, so neither the button nor its hover fill lets it through. */}
          <CarouselPrevious className="left-4 size-11 opacity-0 shadow-lg/40 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 lg:left-8 dark:hover:bg-accent [&_svg]:size-5" />
          <CarouselNext
            ref={nextButtonRef}
            className="right-4 size-11 opacity-0 shadow-lg/40 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 lg:right-8 dark:hover:bg-accent [&_svg]:size-5"
          />
        </>
      )}
      {!isDialog && (
        <div className="relative mx-auto mt-[calc(1rem+2%)] w-fit">
          <CarouselDots size="sm" gap="lg" />
          {/* Only a reader on reduced motion needs it: their slides never start on their own, and theirs is the one pause
              that must not be undone by the pointer leaving */}
          {items.length > 1 && reducedMotion && (
            <Button
              variant="ghost"
              size="micro"
              aria-label={i18n.t(autoplaying ? 'c:pause' : 'c:play')}
              onClick={toggleAutoplay}
              className="absolute top-1/2 left-full z-10 ml-3 size-6 -translate-y-1/2 rounded-full p-0 text-muted-foreground hover:text-foreground"
            >
              {autoplaying ? <PauseIcon className="size-3" /> : <PlayIcon className="size-3" />}
            </Button>
          )}
        </div>
      )}
    </BaseCarousel>
  );
}
