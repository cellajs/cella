import { DialogTitle } from '@radix-ui/react-dialog';
import Autoplay from 'embla-carousel-autoplay';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { cn } from '~/lib/utils';
import { Carousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';
import { Dialog, DialogContent, DialogHeader } from '~/modules/ui/dialog';
import { useThemeStore } from '~/store/theme';

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
              <div className="overflow-hidden h-full">
                <img src={`/static/screenshots/${slide.src}`} alt={`Slide ${idx}`} className={`${imageClass} w-full h-full`} />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-4 lg:left-8 opacity-0 transition-opacity group-hover:opacity-100" />
        <CarouselNext className="right-4 lg:right-8 opacity-0 transition-opacity group-hover:opacity-100" />
        {!inDialog && <CarouselDots className="relative mt-[calc(20px+2%)]" />}
      </Carousel>
    );
  };

  const renderDeviceMockup = (inView: boolean) => {
    switch (type) {
      case 'tablet':
        return (
          <div className="relative mx-auto border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] aspect-[3/4]">
            <div className="h-[32px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[72px] rounded-s-lg" />
            <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[124px] rounded-s-lg" />
            <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[178px] rounded-s-lg" />
            <div className="h-[64px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -end-[17px] top-[142px] rounded-e-lg" />
            <div className="rounded-[2rem] bg-white dark:bg-gray-800 h-full w-full cursor-pointer">
              {inView && renderCarousel({ inDialog: false })}
            </div>
          </div>
        );
      case 'pc':
        return (
          <div className="w-full">
            <div className="relative mx-auto border-gray-400/75 mb-[1px] dark:border-gray-600 border-[8px] rounded-t-xl max-w-[85%] aspect-video">
              <div className="rounded-lg h-full w-full bg-background cursor-pointer">{inView && renderCarousel({ inDialog: false })}</div>
            </div>
            <div className="relative mx-auto bg-gray-300 dark:bg-gray-700 rounded-b-xl rounded-t-sm h-[17px] md:h-[21px]">
              <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl w-[56px] h-[5px] md:w-[96px] md:h-[8px] bg-gray-500/25 dark:bg-gray-900/25 border-background border border-t-0" />
            </div>
          </div>
        );
      case 'mobile':
        return (
          <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[14px] rounded-[2.5rem] aspect-[1/2]">
            <div className="h-[32px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[72px] rounded-s-lg" />
            <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[124px] rounded-s-lg" />
            <div className="h-[46px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -start-[17px] top-[178px] rounded-s-lg" />
            <div className="h-[64px] w-[3px] bg-gray-800 dark:bg-gray-800 absolute -end-[17px] top-[142px] rounded-e-lg" />
            <div className="rounded-[2rem] w-[272px] h-[572px] bg-white dark:bg-gray-800 cursor-pointer">
              {inView && renderCarousel({ inDialog: false })}
            </div>
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
          <div className="flex flex-wrap relative -z-[1] justify-center grow">{renderCarousel({ inDialog: true, slide: carouselSlide })}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeviceMockup;
