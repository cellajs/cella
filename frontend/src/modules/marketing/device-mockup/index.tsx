import { useInView } from 'react-intersection-observer';

import AttachmentsCarousel from '~/modules/attachments/carousel';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

import DeviceFrame from '~/modules/marketing/device-mockup/frame';

type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceMockupProps {
  lightSlides?: { url: string; name?: string }[];
  darkSlides?: { url: string; name?: string }[];
  className?: string;
  type: DeviceType;
}

const DeviceMockup = ({ lightSlides, darkSlides, type, className }: DeviceMockupProps) => {
  const mode = useUIStore((state) => state.mode);

  const slides = mode === 'dark' ? darkSlides : lightSlides;

  const { ref, inView } = useInView({
    triggerOnce: false,
    threshold: 0,
  });
  const mockupClass = `transition-opacity duration-700 ease-out ${inView ? 'opacity-100' : 'opacity-0'}`;

  return (
    <div className={cn(mockupClass, className)} ref={ref}>
      <DeviceFrame
        type={type}
        inView={inView}
        renderCarousel={(className) => {
          return <AttachmentsCarousel slides={slides} isDialog={false} classNameContainer={className} />;
        }}
      />
    </div>
  );
};

export default DeviceMockup;
