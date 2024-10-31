import Autoplay from 'embla-carousel-autoplay';
import { useState } from 'react';
import ReactPanZoom from '~/modules/common/image-viewer';
import { Carousel as BaseCarousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';

interface CarouselProps {
  slide?: number;
  slides?: { src: string }[];
  isDialog?: boolean;
  onOpenChange: (open: boolean, slide?: number) => void;
}

const Carousel = ({ slides, onOpenChange, isDialog = false, slide = 0 }: CarouselProps) => {
  const [current, setCurrent] = useState(0);
  const imageClass = isDialog ? 'object-contain' : '';

  return (
    <BaseCarousel
      opts={{ duration: 20, loop: true, startIndex: slide }}
      plugins={isDialog ? [] : [Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true })]}
      className="w-full h-full group"
      setApi={(api) => {
        if (!api) return;
        setCurrent(api.selectedScrollSnap());
        api.on('select', () => setCurrent(api.selectedScrollSnap()));
      }}
    >
      <CarouselContent className="h-full">
        {slides?.map((slide, idx) => {
          return (
            <CarouselItem key={slide.src} onClick={() => onOpenChange(true, idx)}>
              <div className="overflow-hidden relative h-full rounded-t-[.5rem]">
                {isDialog ? (
                  <ReactPanZoom image={slide.src} alt={`Slide ${idx}`} imageClass={imageClass} showButtons={current === idx} />
                ) : (
                  <img src={slide.src} alt={`Slide ${idx}`} className={`${imageClass} w-full h-full`} />
                )}
              </div>
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
