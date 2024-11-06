import Autoplay from 'embla-carousel-autoplay';
import { useState } from 'react';
import { Carousel as BaseCarousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';
import { AttachmentItem } from './attachments';

interface CarouselProps {
  slide?: number;
  slides?: { src: string; fileType?: string }[];
  isDialog?: boolean;
  onOpenChange: (open: boolean, slide?: number) => void;
}

const Carousel = ({ slides, onOpenChange, isDialog = false, slide = 0 }: CarouselProps) => {
  const [current, setCurrent] = useState(0);
  const itemClass = isDialog ? 'object-contain' : '';
  const autoplay = Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true });

  return (
    <BaseCarousel
      isDialog={isDialog}
      opts={{ duration: 20, loop: true, startIndex: slide }}
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
            <CarouselItem key={src} onClick={() => onOpenChange(true, idx)}>
              <AttachmentItem
                containerClassName="overflow-hidden h-full relative rounded-t-[.5rem] flex items-center justify-center"
                itemClassName={itemClass}
                type={fileType}
                imagePanZoom={isDialog}
                showButtons={current === idx}
                source={src}
                altName={`Slide ${idx}`}
              />
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-100" />
      <CarouselNext className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-100" />
      {!isDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)]" />}
    </BaseCarousel>
  );
};

export default Carousel;
