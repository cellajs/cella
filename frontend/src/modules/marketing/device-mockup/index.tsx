import { useInView } from 'react-intersection-observer';

import Carousel from '~/modules/common/carousel';
import { useThemeStore } from '~/store/theme';
import { cn } from '~/utils/cn';

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

  const slides = mode === 'dark' ? darkSlides : lightSlides;

  const { ref, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });
  const mockupClass = `transition-opacity duration-700 ease-out ${inView ? 'opacity-1' : 'opacity-0'}`;

  return (
    <div className={cn(mockupClass, className)} ref={ref}>
      <DeviceFrame type={type} inView={inView} renderCarousel={(isDialog) => <Carousel slides={slides} isDialog={isDialog} />} />
    </div>
  );
};

export default DeviceMockup;
