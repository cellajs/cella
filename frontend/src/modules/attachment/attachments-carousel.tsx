import { useNavigate } from '@tanstack/react-router';
import Autoplay from 'embla-carousel-autoplay';
import { ChevronUpIcon, DownloadIcon, ExternalLinkIcon, InfoIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { textFromDocument } from 'shared/blocknote';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { useDownloader } from '~/hooks/use-downloader';
import { useLatestCallback, useLatestRef } from '~/hooks/use-latest-ref';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { attachmentDialogParam, attachmentDialogStageClassName, clearAttachmentDialogFromUrl } from '~/modules/attachment/dialog/params';
import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
import type { PendingUpload } from '~/modules/attachment/helpers/pending-uploads';
import { AttachmentRender } from '~/modules/attachment/render/attachment-render';
import { CloseButton } from '~/modules/common/close-button';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { MiddleCut } from '~/modules/common/middle-cut';
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
import { HelpCollapse } from '~/modules/ui/help-toggle';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

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

/** The viewer header's icon buttons: `-my-1` keeps the header at the stage's 3rem inset, `shrink-0` keeps a long title from squeezing them. */
export const headerButtonClass = tw('-my-1 size-8 shrink-0');

type AttachmentsCarouselProps = {
  items: CarouselItemData[];
  itemIndex?: number;
  containerClassName?: string;
} & ({ isDialog: true; saveInSearchParams: boolean } | { isDialog?: false; saveInSearchParams?: never });

export function AttachmentsCarousel({ items, isDialog = false, itemIndex = 0, saveInSearchParams, containerClassName }: AttachmentsCarouselProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);
  const { download, isInProgress } = useDownloader();

  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  // The slide Embla shows, kept by id so a change in the item set keeps it.
  const [selectedId, setSelectedId] = useState<string | undefined>(items[itemIndex]?.id);
  const selectedIndex = items.findIndex((item) => item.id === selectedId);
  const currentItemIndex = selectedIndex === -1 ? itemIndex : selectedIndex;
  const currentItem = items[currentItemIndex] ?? null;
  // Editing lives in the attachments table; the dialog only shows the text, so the toggle needs something to show.
  const descriptionText = textFromDocument(currentItem?.description);

  // Embla restarts on `startIndex` whenever its options change, so it moves only with the item count.
  const [start, setStart] = useState({ index: currentItemIndex, count: items.length });
  if (start.count !== items.length) setStart({ index: currentItemIndex, count: items.length });

  const selectSlide = (item: CarouselItemData | undefined) => {
    if (item) setSelectedId(item.id);
    if (!saveInSearchParams) return;

    if (!item) {
      clearAttachmentDialogFromUrl();
      removeDialog();
      return;
    }

    navigate({ to: '.', replace: true, resetScroll: false, search: (prev) => ({ ...prev, [attachmentDialogParam]: item.id }) });
  };

  // Autoplay pauses under the pointer or keyboard focus; with reduced motion it starts only from the play control.
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
      opts={{ duration: 20, loop: true, startIndex: start.index, watchDrag: items.length > 1 }}
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
      className={cn('group/carousel size-full', isDialog && 'p-2')}
      setApi={handleSetApi}
    >
      {/* Positioned on the carousel's padding box, so the bar spans the dialog edge to edge past the p-2 around the slides.
          z-20 matches the zoom controls: at z-10 the viewer, a flex item with the same index, paints over the title. */}
      {isDialog && (
        <div className="absolute top-0 left-0 z-20 w-full bg-background/60 p-3 backdrop-blur-xs">
          <div className="flex gap-2">
            {/* The visible name is the dialog's accessible name; with no name, a screen-reader-only title labels it. */}
            {currentItem.name ? (
              <DialogTitle className="ml-1 flex h-6 min-w-0 items-center gap-2 truncate text-base leading-6 tracking-tight max-sm:text-sm">
                {currentItem.contentType && <FilePlaceholder contentType={currentItem.contentType} className="size-4 shrink-0" strokeWidth={2} />}
                <MiddleCut text={currentItem.name} />
              </DialogTitle>
            ) : (
              <DialogTitle className="sr-only">{currentItem.filename || t('c:attachment')}</DialogTitle>
            )}
            {descriptionText && (
              <Button
                variant="ghost"
                size="icon"
                aria-expanded={descriptionOpen}
                aria-label={t('c:description')}
                className={cn(headerButtonClass, 'group/description-toggle')}
                press={false}
                onClick={() => setDescriptionOpen((prev) => !prev)}
              >
                <span className="relative size-5">
                  <InfoIcon className="absolute inset-0 size-5 transition duration-200 group-aria-expanded/description-toggle:rotate-90 group-aria-expanded/description-toggle:opacity-0 motion-reduce:transition-none" />
                  <ChevronUpIcon className="absolute inset-0 size-5 -rotate-90 opacity-0 transition duration-200 group-aria-expanded/description-toggle:rotate-0 group-aria-expanded/description-toggle:opacity-100 motion-reduce:transition-none" />
                </span>
              </Button>
            )}
            <div className="grow" />
            {isCDNUrl(currentItem.url) && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('c:open')}
                className={headerButtonClass}
                onClick={() => window.open(currentItem.url, '_blank')}
              >
                <ExternalLinkIcon className="size-5" />
              </Button>
            )}

            {/* Download also handles blob URLs; open-in-new-tab stays CDN-only since top-level blob navigation is browser-dependent. */}
            {(isCDNUrl(currentItem.url) || currentItem.isLocal) && (
              <Button
                variant="ghost"
                size="icon"
                disabled={isInProgress}
                aria-label={t('c:download')}
                className={headerButtonClass}
                onClick={() => download(currentItem.url, currentItem.filename)}
              >
                {isInProgress ? <Spinner className="size-5 text-foreground-soft" noDelay /> : <DownloadIcon className="size-5" />}
              </Button>
            )}

            <CloseButton onClick={() => removeDialog()} className={headerButtonClass} />
          </div>
          {descriptionText && (
            <HelpCollapse open={descriptionOpen}>
              <p className="mt-2 ml-1 max-w-measure">{descriptionText}</p>
            </HelpCollapse>
          )}
        </div>
      )}

      <CarouselContent className="h-full">
        {items.map(({ id, url, name, filename, contentType = 'image', convertedContentType, pendingUpload }, index) => (
          <CarouselItem
            key={id}
            onClick={() => {
              if (isDialog) return;
              openAttachmentDialog({ attachmentIndex: index, attachments: items, triggerRef: nextButtonRef });
            }}
          >
            <AttachmentRender
              containerClassName={cn(
                'relative flex h-full items-center justify-center overflow-hidden',
                isDialog && attachmentDialogStageClassName,
                containerClassName,
              )}
              itemClassName={isDialog ? 'object-contain' : undefined}
              type={convertedContentType || contentType}
              imagePanZoom={isDialog}
              showButtons={currentItemIndex === index}
              url={url}
              pendingUpload={pendingUpload}
              filename={filename}
              alt={name || filename || t('c:attachment')}
              onBackdropClick={isDialog ? () => removeDialog() : undefined}
            />
          </CarouselItem>
        ))}
      </CarouselContent>

      {items.length > 1 && (
        <>
          {/* Solid on every backdrop: the slide behind can be any image, so neither the button nor its hover fill lets it through. */}
          <CarouselPrevious className="left-4 size-11 opacity-0 shadow-floating transition-opacity focus-visible:opacity-100 group-hover/carousel:opacity-100 lg:left-8 [&_svg]:size-5" />
          <CarouselNext
            ref={nextButtonRef}
            className="right-4 size-11 opacity-0 shadow-floating transition-opacity focus-visible:opacity-100 group-hover/carousel:opacity-100 lg:right-8 [&_svg]:size-5"
          />
        </>
      )}
      {!isDialog && (
        <div className="relative mx-auto mt-[calc(1rem+2%)] w-fit">
          <CarouselDots size="sm" gap="lg" />
          {/* Reduced motion only: autoplay starts from this control, and a pause holds until it is pressed again. */}
          {items.length > 1 && reducedMotion && (
            <Button
              variant="ghost"
              size="micro"
              aria-label={t(autoplaying ? 'c:pause' : 'c:play')}
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
