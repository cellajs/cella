import { useNavigate, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import Autoplay from 'embla-carousel-autoplay';
import { Download, ExternalLink, X } from 'lucide-react';
import { useState } from 'react';
import useDownloader from 'react-use-downloader';
import { useEventListener } from '~/hooks/use-event-listener';
import { AttachmentRender } from '~/modules/attachments/attachment-render';
import FilePlaceholder from '~/modules/attachments/file-placeholder';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { Carousel as BaseCarousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';
import { cn } from '~/utils/cn';
import Spinner from '../common/spinner';
import { clearAttachmentDialogSearchParams } from './attachment-dialog-handler';

type CarouselItemData = { url: string; id?: string; name?: string; filename?: string; contentType?: string };
interface CarouselPropsBase {
  itemIndex?: number;
  items?: CarouselItemData[];
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

const AttachmentsCarousel = ({ items = [], isDialog = false, itemIndex = 0, saveInSearchParams = false, classNameContainer }: CarouselProps) => {
  const navigate = useNavigate();

  const { attachmentDialogId } = useSearch({ strict: false });
  const [currentItem, setCurrentItem] = useState(items.find((item) => item.url === attachmentDialogId) || items[itemIndex]);
  const [watchDrag, setWatchDrag] = useState(items.length > 1);

  const itemClass = isDialog ? 'object-contain' : '';
  const autoplay = Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true });
  const currentItemIndex = items.findIndex((item) => item.url === currentItem?.url) || itemIndex;

  const { download, isInProgress } = useDownloader();

  useEventListener('toggleCarouselDrag', (e) => {
    const shouldWatchDrag = e.detail && items.length > 1;
    setWatchDrag(shouldWatchDrag);
  });

  const updateSearchParam = (newItem: CarouselItemData) => {
    if (!saveInSearchParams) return;
    if (!newItem) {
      clearAttachmentDialogSearchParams();
      return dialog.remove();
    }
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

  // Reopen dialog after reload if the attachmentDialogId parameter exists
  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: itemIndex, watchDrag }}
      plugins={isDialog ? [] : [autoplay]}
      className="w-full h-full group"
      setApi={(api) => {
        if (!api) return;
        api.on('select', () => {
          const newItem = items[api.selectedScrollSnap()];
          updateSearchParam(newItem);
          setCurrentItem(newItem);
        });
      }}
    >
      {currentItem && isDialog && (
        <div className="fixed z-10 top-0 left-0 w-full flex gap-2 p-3 text-center sm:text-left bg-background/60 backdrop-blur-xs">
          {currentItem.name && (
            <h2 className="text-base tracking-tight flex ml-1 items-center gap-2 leading-6 h-6">
              {currentItem.contentType && <FilePlaceholder contentType={currentItem.contentType} iconSize={16} strokeWidth={2} />}
              {currentItem.name}
            </h2>
          )}
          <div className="grow" />
          {currentItem.url.startsWith(config.publicCDNUrl) && (
            <Button
              variant="ghost"
              size="icon"
              className="-my-1 w-8 h-8 opacity-70 hover:opacity-100"
              onClick={() => window.open(currentItem.url, '_blank')}
            >
              <ExternalLink className="h-5 w-5" strokeWidth={1.5} />
            </Button>
          )}

          {currentItem.url.startsWith(config.publicCDNUrl) && (
            <Button
              variant="ghost"
              size="icon"
              disabled={isInProgress}
              className="-my-1 w-8 h-8 opacity-70 hover:opacity-100"
              onClick={() => download(currentItem.url, currentItem.filename || 'file')}
            >
              {isInProgress ? <Spinner className="w-5 h-5 text-foreground/80" noDelay /> : <Download className="h-5 w-5" strokeWidth={1.5} />}
            </Button>
          )}

          <Button variant="ghost" size="icon" className="-my-1 w-8 h-8 opacity-70 hover:opacity-100" onClick={() => dialog.remove()}>
            <X className="h-6 w-6" strokeWidth={1.5} />
          </Button>
        </div>
      )}

      <CarouselContent className="h-full">
        {items?.map(({ url, contentType = 'image' }, idx) => {
          return (
            <CarouselItem
              key={url}
              onClick={() => {
                if (isDialog) return;
                openAttachmentDialog(idx, items);
              }}
            >
              <AttachmentRender
                containerClassName={cn('overflow-hidden h-full relative flex items-center justify-center, ', classNameContainer)}
                itemClassName={itemClass}
                type={contentType}
                imagePanZoom={isDialog}
                showButtons={currentItemIndex === idx}
                url={url}
                altName={`Slide ${idx}`}
                togglePanState
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {(items?.length ?? 0) > 1 && (
        <>
          <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-100" />
          <CarouselNext className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-100" />
        </>
      )}
      {!isDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)]" />}
    </BaseCarousel>
  );
};

export default AttachmentsCarousel;
