import Autoplay from 'embla-carousel-autoplay';
import { useState } from 'react';
import ReactPanZoom from '~/modules/common/panwiever';
import { Carousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';

interface DeviceCarouselProps {
  slide?: number;
  slides?: { src: string }[];
  isDialog?: boolean;
  onOpenChange: (open: boolean, slide?: number) => void;
}

const DeviceCarousel = ({ slides, onOpenChange, isDialog = false, slide = 0 }: DeviceCarouselProps) => {
  const [current, setCurrent] = useState(0);
  const imageClass = isDialog ? 'object-contain' : '';

  return (
    <Carousel
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
                <ReactPanZoom
                  image={`/static/screenshots/${slide.src}`}
                  alt={`Slide ${idx}`}
                  imageClass={imageClass}
                  showButtons={current === idx && isDialog}
                />
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>
      <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-100" />
      <CarouselNext className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-100" />
      {!isDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)]" />}
    </Carousel>
  );
};

export default DeviceCarousel;
