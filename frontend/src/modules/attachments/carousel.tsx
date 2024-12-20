import { useNavigate, useSearch } from '@tanstack/react-router';
import Autoplay from 'embla-carousel-autoplay';
import { useEffect, useState } from 'react';
import { useEventListener } from '~/hooks/use-event-listener';
import { AttachmentRender } from '~/modules/attachments/attachment-render';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { Carousel as BaseCarousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';

interface CarouselPropsBase {
  slide?: number;
  slides?: { src: string; fileType?: string }[];
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

const AttachmentsCarousel = ({ slides = [], isDialog = false, slide = 0, saveInSearchParams = false }: CarouselProps) => {
  const navigate = useNavigate();
  const { attachmentPreview } = useSearch({ strict: false });

  const [current, setCurrent] = useState(slides.findIndex((slide) => slide.src === attachmentPreview) ?? 0);
  const [watchDrag, setWatchDrag] = useState(slides.length > 1);

  const itemClass = isDialog ? 'object-contain' : '';
  const autoplay = Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true });

  useEventListener('toggleCarouselDrag', (e) => {
    const shouldWatchDrag = e.detail && slides.length > 1;
    setWatchDrag(shouldWatchDrag);
  });

  useEffect(() => {
    if (!saveInSearchParams || slides.length === 0) return;

    // Ensure current is within bounds and the slide exists
    const currentSlide = slides[current] ? slides[current].src : undefined;

    navigate({
      to: '.',
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        attachmentPreview: currentSlide,
      }),
    });

    return () => {
      navigate({
        to: '.',
        replace: true,
        resetScroll: false,
        search: (prev) => ({
          ...prev,
          attachmentPreview: undefined,
        }),
      });
    };
  }, [current]);

  // Reopen dialog after reload if the attachmentPreview parameter exists
  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: slide, watchDrag }}
      plugins={isDialog ? [] : [autoplay]}
      className="w-full h-full group"
      setApi={(api) => {
        if (!api) return;
        setCurrent(api.selectedScrollSnap());
        api.on('select', () => setCurrent(api.selectedScrollSnap()));
      }}
    >
      <CarouselContent className="h-full">
        {slides?.map(({ src, fileType = 'image' }, idx) => {
          return (
            <CarouselItem key={src} onClick={() => openAttachmentDialog(idx, slides)}>
              <AttachmentRender
                containerClassName="overflow-hidden h-full relative rounded-t-[.5rem] flex items-center justify-center"
                itemClassName={itemClass}
                type={fileType}
                imagePanZoom={isDialog}
                showButtons={current === idx}
                source={src}
                altName={`Slide ${idx}`}
                togglePanState
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {(slides?.length ?? 0) > 1 && (
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
