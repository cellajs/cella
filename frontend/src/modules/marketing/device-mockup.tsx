import { DialogTitle } from '@radix-ui/react-dialog';
import Autoplay from 'embla-carousel-autoplay';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { Carousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';
import { Dialog, DialogContent, DialogHeader } from '~/modules/ui/dialog';
import { useThemeStore } from '~/store/theme';
import { cn } from '~/utils/utils';

type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceMockupProps {
  lightSlides?: { src: string }[];
  darkSlides?: { src: string }[];
  className?: string;
  type: DeviceType;
}

const DeviceMockup = ({ lightSlides, darkSlides, type, className }: DeviceMockupProps) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const [isOpen, setOpen] = useState(false);
  const [carouselSlide, setCarouselSlide] = useState(0);

  const slides = mode === 'dark' ? darkSlides : lightSlides;

  const onOpenChange = (open: boolean, slide?: number) => {
    setOpen(open);
    setCarouselSlide(slide || 0);
  };

  const renderCarousel = ({ inDialog = false, slide = 0 }) => {
    const imageClass = inDialog ? 'object-contain' : '';
    return (
      <Carousel
        opts={{ duration: 20, loop: true, startIndex: slide }}
        plugins={inDialog ? [] : [Autoplay({ delay: 4000, stopOnInteraction: true, stopOnMouseEnter: true })]}
        className="w-full h-full group"
      >
        <CarouselContent className="h-full">
          {slides?.map((slide, idx) => (
            <CarouselItem key={slide.src} onClick={() => onOpenChange(true, idx)}>
              <div className="overflow-hidden h-full rounded-t-[.5rem]">
                <img src={`/static/screenshots/${slide.src}`} alt={`Slide ${idx}`} className={`${imageClass} w-full h-full`} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-100" />
        <CarouselNext className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-100" />
        {!inDialog && <CarouselDots size="sm" gap="lg" className="relative mt-[calc(1rem+2%)]" />}
      </Carousel>
    );
  };

  const renderDeviceMockup = (inView: boolean) => {
    switch (type) {
      case 'tablet':
        return (
          <div className="relative mx-auto border-gray-800 bg-gray-800 border-[.88rem] rounded-[2.5rem] aspect-[3/4]">
            <div className="h-8 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-20 rounded-s-lg" />
            <div className="h-12 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-32 rounded-s-lg" />
            <div className="h-12 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-44 rounded-s-lg" />
            <div className="h-16 w-1 bg-gray-800 dark:bg-gray-800 absolute -end-4 top-36 rounded-e-lg" />
            <div className="rounded-[2rem] bg-white dark:bg-gray-800 h-full w-full cursor-pointer">
              {inView && renderCarousel({ inDialog: false })}
            </div>
          </div>
        );
      case 'pc':
        return (
          <div className="w-full">
            <div className="relative mx-auto border-gray-400/75 mb-[.07rem] dark:border-gray-600 border-[.25rem] rounded-t-xl max-w-[85%] aspect-video">
              <div className="rounded-lg h-full w-full bg-background cursor-pointer">{inView && renderCarousel({ inDialog: false })}</div>
            </div>
            <div className="relative mx-auto bg-gray-300 dark:bg-gray-700 rounded-b-xl rounded-t-sm h-4 md:h-5">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl w-14 h-1 md:w-24 md:h-2 bg-gray-500/25 dark:bg-gray-900/25 border-background border border-t-0" />
            </div>
          </div>
        );
      case 'mobile':
        return (
          <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[.88rem] rounded-[2.5rem] aspect-[1/2]">
            <div className="h-8 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-20 rounded-s-lg" />
            <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-32 rounded-s-lg" />
            <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-44 rounded-s-lg" />
            <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -end-4 top-36 rounded-e-lg" />
            <div className="rounded-8 w-72 h-[39rem] bg-white dark:bg-gray-800 cursor-pointer">{inView && renderCarousel({ inDialog: false })}</div>
          </div>
        );
    }
  };

  const { ref, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });
  const mockupClass = `transition-opacity duration-700 ease-out ${inView ? 'opacity-1' : 'opacity-0'}`;

  return (
    <div className={cn(mockupClass, className)} ref={ref}>
      {renderDeviceMockup(inView)}

      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0">
          <DialogHeader className="absolute p-3 w-full backdrop-blur-sm bg-background/50">
            <DialogTitle className="text-center font-semibold text-lg">{t('common:view_screenshot')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap relative -z-[1] h-screen justify-center p-2 grow">
            {renderCarousel({ inDialog: true, slide: carouselSlide })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeviceMockup;
