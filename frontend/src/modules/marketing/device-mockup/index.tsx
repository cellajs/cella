import { useInView } from 'react-intersection-observer';

import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachment/carousel';
import DeviceFrame from '~/modules/marketing/device-mockup/frame';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

type DeviceType = 'mobile' | 'tablet' | 'pc';
type MockupItem = Pick<CarouselItemData, 'url' | 'id' | 'name'>;

interface DeviceMockupProps {
  lightItems?: MockupItem[];
  darkItems?: MockupItem[];
  className?: string;
  type: DeviceType;
}

function DeviceMockup({ lightItems, darkItems, type, className }: DeviceMockupProps) {
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
          return <AttachmentsCarousel items={items || []} isDialog={false} classNameContainer={className} />;
        }}
      />
    </div>
  );
}

export default DeviceMockup;
