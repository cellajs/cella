import Autoplay from 'embla-carousel-autoplay';
import { Grab, Hand } from 'lucide-react';
import { useState } from 'react';
import { AttachmentItem } from '~/modules/common/attachments';
import { openCarouselDialog } from '~/modules/common/carousel/carousel-dialog';
import { Button } from '~/modules/ui/button';
import { Carousel as BaseCarousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';
import { TooltipButton } from '../tooltip-button';

interface CarouselProps {
  slide?: number;
  slides?: { src: string; fileType?: string }[];
  isDialog?: boolean;
}

const Carousel = ({ slides, isDialog = false, slide = 0 }: CarouselProps) => {
  const [current, setCurrent] = useState(0);
  const itemClass = isDialog ? 'object-contain' : '';
  const autoplay = Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true });
  const [isPanViewEnabled, setIsPanViewEnabled] = useState(false);

  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: slide, watchDrag: !isPanViewEnabled }}
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
            <CarouselItem key={src} onClick={() => openCarouselDialog(idx, slides)}>
              <AttachmentItem
                containerClassName="overflow-hidden h-full relative rounded-t-[.5rem] flex items-center justify-center"
                itemClassName={itemClass}
                type={fileType}
                enablePan={isPanViewEnabled}
                imagePanZoom={isDialog}
                showButtons={current === idx}
                source={src}
                altName={`Slide ${idx}`}
                reactPanZoomCustomButtons={togglePanViewButton(isPanViewEnabled, () => setIsPanViewEnabled((prev) => !prev))}
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

export default Carousel;

const togglePanViewButton = (canGrab: boolean, onClick: () => void) => (
  <TooltipButton toolTipContent="Toggle pan view">
    <Button onClick={onClick} className="bg-background border border-input rounded-none hover:bg-accent text-accent-foreground">
      {canGrab ? <Grab size={14} /> : <Hand size={14} />}
    </Button>
  </TooltipButton>
);
