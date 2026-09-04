import { useNavigate, useSearch } from '@tanstack/react-router';
import Autoplay from 'embla-carousel-autoplay';
import i18n from 'i18next';
import { ChevronUpIcon, DownloadIcon, ExternalLinkIcon, InfoIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import useDownloader from 'react-use-downloader';
import { textFromDocument } from 'shared/blocknote';
import { isCDNUrl } from 'shared/utils/is-cdn-url';
import { useLatestCallback, useLatestRef } from '~/hooks/use-latest-ref';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { ATTACHMENT_DIALOG_PARAM, clearAttachmentDialogSearchParams } from '~/modules/attachment/dialog/params';
import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
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
};

interface CarouselPropsBase {
  items: CarouselItemData[];
  itemIndex?: number;
  classNameContainer?: string;
}

type CarouselProps =
  | (CarouselPropsBase & {
      isDialog: true;
      saveInSearchParams: boolean;
    })
  | (CarouselPropsBase & {
      isDialog?: false;
      saveInSearchParams?: never;
    });

export function AttachmentsCarousel({
  items,
  isDialog = false,
  itemIndex = 0,
  saveInSearchParams = false,
  classNameContainer,
}: CarouselProps) {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);
  const { download, isInProgress } = useDownloader();

  const { attachmentDialogId } = useSearch({ strict: false });

  const nextButtonRef = useRef(null);
  const [watchDrag, setWatchDrag] = useState(items.length > 1);
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const currentItem = items.find((item) => item.id === attachmentDialogId) ?? items[itemIndex] ?? null;
  // Editing lives in the attachments table; the dialog only shows the text, so the toggle needs something to show.
  const descriptionText = textFromDocument(currentItem?.description);

  const currentItemIndex = (() => {
    const index = items.findIndex((item) => item.id === currentItem?.id);
    return index !== -1 ? index : itemIndex;
  })();

  // A stable start index stops Embla reinitializing (flashing) on slide nav; it re-syncs only on item count change.
  const startIndexRef = useRef<number | null>(null);
  const itemCountRef = useRef(items.length);
  if (startIndexRef.current === null || itemCountRef.current !== items.length) {
    startIndexRef.current = currentItemIndex;
    itemCountRef.current = items.length;
  }

  const updateSearchParam = (newItem: CarouselItemData | undefined) => {
    if (!saveInSearchParams) return;

    if (!newItem) {
      clearAttachmentDialogSearchParams();
      removeDialog();
      return;
    }

    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, [ATTACHMENT_DIALOG_PARAM]: newItem.id }),
    });
  };

  const toggleWatchDrag = (enabled: boolean) => setWatchDrag(enabled && items.length > 1);

  // Stable setApi registers Embla's `select` listener once; an inline one stacks duplicate listeners.
  const itemsRef = useLatestRef(items);
  const handleSelect = useLatestCallback(updateSearchParam);
  const handleSetApi = useCallback(
    (api: CarouselApi) => {
      if (!api) return;
      api.on('select', () => handleSelect(itemsRef.current[api.selectedScrollSnap()]));
    },
    [itemsRef, handleSelect],
  );

  if (!items.length || !currentItem) return null;

  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: startIndexRef.current ?? 0, watchDrag }}
      plugins={isDialog ? [] : [Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true })]}
      className="group h-full w-full"
      setApi={handleSetApi}
    >
      {currentItem && isDialog && (
        <div className="fixed top-0 left-0 z-10 flex w-full flex-col bg-background/60 p-3 backdrop-blur-xs">
          <div className="flex w-full gap-2 text-center sm:text-left">
            {/* The visible name is the dialog's accessible name; with no name, a screen-reader-only title labels it. */}
            {currentItem.name ? (
              <DialogTitle className="ml-1 flex h-6 min-w-0 items-center gap-2 truncate text-base leading-6 tracking-tight max-sm:text-sm">
                {currentItem.contentType && (
                  <FilePlaceholder contentType={currentItem.contentType} className="icon-md shrink-0" strokeWidth={2} />
                )}
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
                className="-my-1 size-8 shrink-0 opacity-70 hover:opacity-100 active:translate-y-0!"
                onClick={() => setDescriptionOpen(!descriptionOpen)}
              >
                <span className="relative size-5">
                  <InfoIcon
                    className={cn(
                      'absolute inset-0 h-5 w-5 transition-all duration-200 motion-reduce:transition-none',
                      descriptionOpen ? 'rotate-90 opacity-0' : 'rotate-0 opacity-100',
                    )}
                    strokeWidth={1.5}
                  />
                  <ChevronUpIcon
                    className={cn(
                      'absolute inset-0 h-5 w-5 transition-all duration-200 motion-reduce:transition-none',
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
                className="-my-1 size-8 opacity-70 hover:opacity-100"
                onClick={() => window.open(currentItem.url, '_blank')}
              >
                <ExternalLinkIcon className="h-5 w-5" strokeWidth={1.5} />
              </Button>
            )}

            {/* Download also handles blob URLs; open-in-new-tab stays CDN-only since top-level blob navigation is browser-dependent. */}
            {(isCDNUrl(currentItem.url) || currentItem.isLocal) && (
              <Button
                variant="ghost"
                size="icon"
                disabled={isInProgress}
                className="-my-1 size-8 opacity-70 hover:opacity-100"
                onClick={() => download(currentItem.url, currentItem.filename || 'file')}
              >
                {isInProgress ? (
                  <Spinner className="size-5 text-foreground/80" noDelay />
                ) : (
                  <DownloadIcon className="h-5 w-5" strokeWidth={1.5} />
                )}
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
                <p className="mt-2 ml-1 max-w-3xl text-sm opacity-80 max-sm:mx-auto">{descriptionText}</p>
              </div>
            </div>
          )}
        </div>
      )}

      <CarouselContent className="h-full">
        {items.map(({ id, url, filename, contentType = 'image', convertedContentType }, idx) => {
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
                  classNameContainer,
                )}
                itemClassName={isDialog ? 'object-contain' : ''}
                type={convertedContentType || contentType}
                imagePanZoom={isDialog}
                showButtons={currentItemIndex === idx}
                url={url}
                filename={filename}
                altName={i18n.t('c:attachment')}
                onPanStateToggle={toggleWatchDrag}
                onBackdropClick={isDialog ? () => removeDialog() : undefined}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>

      {items.length > 1 && (
        <>
          <CarouselPrevious className="left-4 opacity-0 shadow-md transition-opacity focus-visible:opacity-90 group-hover:opacity-70 lg:left-8" />
          <CarouselNext
            ref={nextButtonRef}
            className="right-4 opacity-0 shadow-md transition-opacity focus-visible:opacity-90 group-hover:opacity-70 lg:right-8"
          />
        </>
      )}
      {!isDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)] p-1" />}
    </BaseCarousel>
  );
}
