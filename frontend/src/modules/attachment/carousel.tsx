import { useNavigate, useSearch } from '@tanstack/react-router';
import Autoplay from 'embla-carousel-autoplay';
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import useDownloader from 'react-use-downloader';
import { clearAttachmentDialogSearchParams, openAttachmentDialog } from '~/modules/attachment/dialog/lib';
import { FilePlaceholder } from '~/modules/attachment/file-placeholder';
import { AttachmentRender } from '~/modules/attachment/render';
import { CloseButton } from '~/modules/common/close-button';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import {
  Carousel as BaseCarousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '~/modules/ui/carousel';
import { cn } from '~/utils/cn';
import { isCDNUrl } from '~/utils/is-cdn-url';

export type CarouselItemData = {
  id: string;
  url: string;
  convertedUrl?: string | null;
  name?: string;
  filename?: string;
  contentType?: string;
  convertedContentType?: string | null;
};

interface CarouselPropsBase {
  items: CarouselItemData[];
  itemIndex?: number;
  classNameContainer?: string;
}

type CarouselProps =
  | (CarouselPropsBase & {
      isDialog: true;
      saveInSearchParams: boolean; // Required when isDialog is true
    })
  | (CarouselPropsBase & {
      isDialog?: false;
      saveInSearchParams?: never; // Disallowed when isDialog is false
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

  const currentItem = items.find((item) => item.id === attachmentDialogId) ?? items[itemIndex] ?? null;

  const currentItemIndex = (() => {
    const index = items.findIndex((item) => item.id === currentItem?.id);
    return index !== -1 ? index : itemIndex;
  })();

  const updateSearchParam = (newItem: CarouselItemData | undefined) => {
    if (!saveInSearchParams) return;

    if (!newItem) {
      clearAttachmentDialogSearchParams();
      removeDialog();
      return;
    }

    // Update URL for sharing/bookmarking - dialog uses select to avoid re-render
    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        attachmentDialogId: newItem.id,
      }),
    });
  };

  const toggleWatchDrag = (enabled: boolean) => setWatchDrag(enabled && items.length > 1);

  if (!items.length || !currentItem) return null;

  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: currentItemIndex, watchDrag }}
      plugins={isDialog ? [] : [Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true })]}
      className="w-full h-full group"
      setApi={(api) => {
        if (!api) return;
        api.on('select', () => {
          const newItem = items[api.selectedScrollSnap()];
          updateSearchParam(newItem);
        });
      }}
    >
      {currentItem && isDialog && (
        <div className="fixed z-10 top-0 left-0 w-full flex gap-2 p-3 text-center sm:text-left bg-background/60 backdrop-blur-xs">
          {currentItem.name && (
            <h2 className="text-base tracking-tight flex ml-1 items-center gap-2 leading-6 h-6 truncate max-sm:text-sm">
              {currentItem.contentType && (
                <FilePlaceholder
                  contentType={currentItem.contentType}
                  iconSize={16}
                  className="w-4 shrink-0"
                  strokeWidth={2}
                />
              )}
              <span className="truncate">{currentItem.name}</span>
            </h2>
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

          {isCDNUrl(currentItem.url) && (
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
      )}

      <CarouselContent className="h-full">
        {items.map(({ id, url, convertedUrl, contentType = 'image', convertedContentType }, idx) => {
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
                  'overflow-hidden h-full relative flex items-center justify-center ',
                  classNameContainer,
                )}
                itemClassName={isDialog ? 'object-contain' : ''}
                type={convertedContentType ?? contentType}
                imagePanZoom={isDialog}
                showButtons={currentItemIndex === idx}
                url={convertedUrl ?? url}
                altName={`Slide ${idx}`}
                onPanStateToggle={toggleWatchDrag}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>

      {items.length > 1 && (
        <>
          <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-70 focus-visible:opacity-90 shadow-md" />
          <CarouselNext
            ref={nextButtonRef}
            className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-70 focus-visible:opacity-90 shadow-md"
          />
        </>
      )}
      {!isDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)] p-1" />}
    </BaseCarousel>
  );
}
