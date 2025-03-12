import { useInView } from 'react-intersection-observer';

import AttachmentsCarousel from '~/modules/attachments/carousel';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

import DeviceFrame from '~/modules/marketing/device-mockup/frame';

type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceMockupProps {
  lightItems?: { url: string; name?: string }[];
  darkItems?: { url: string; name?: string }[];
  className?: string;
  type: DeviceType;
}

const DeviceMockup = ({ lightItems, darkItems, type, className }: DeviceMockupProps) => {
  const mode = useUIStore((state) => state.mode);

  const items = mode === 'dark' ? darkItems : lightItems;

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
          return <AttachmentsCarousel items={items} isDialog={false} classNameContainer={className} />;
        }}
      />
    </div>
  );
};

export default DeviceMockup;
