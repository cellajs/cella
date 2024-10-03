import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useThemeStore } from '~/store/theme';
import { cn } from '~/utils/cn';
import DeviceCarousel from './carusel';
import DeviceDialog from './dialog';
import DeviceFrame from './frame';

type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceMockupProps {
  lightSlides?: { src: string }[];
  darkSlides?: { src: string }[];
  className?: string;
  type: DeviceType;
}

const DeviceMockup = ({ lightSlides, darkSlides, type, className }: DeviceMockupProps) => {
  const { mode } = useThemeStore();
  const [isOpen, setOpen] = useState(false);
  const [carouselSlide, setCarouselSlide] = useState(0);

  const slides = mode === 'dark' ? darkSlides : lightSlides;

  const onOpenChange = (open: boolean, slide?: number) => {
    setOpen(open);
    setCarouselSlide(slide || 0);
  };

  const { ref, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });
  const mockupClass = `transition-opacity duration-700 ease-out ${inView ? 'opacity-1' : 'opacity-0'}`;

  return (
    <div className={cn(mockupClass, className)} ref={ref}>
      <DeviceFrame
        type={type}
        inView={inView}
        renderCarousel={(isDialog) => <DeviceCarousel slides={slides} onOpenChange={onOpenChange} isDialog={isDialog} />}
      />
      <DeviceDialog isOpen={isOpen} onOpenChange={setOpen} slides={slides} carouselSlide={carouselSlide} />
    </div>
  );
};

export default DeviceMockup;
