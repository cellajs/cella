import { useInView } from '~/hooks/use-in-view';
import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { DeviceFrame } from '~/modules/marketing/device-mockup-frame';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

type DeviceType = 'mobile' | 'tablet' | 'pc';
type MockupItem = Pick<CarouselItemData, 'url' | 'id' | 'name'>;

interface DeviceMockupProps {
  lightItems?: MockupItem[];
  darkItems?: MockupItem[];
  className?: string;
  type: DeviceType;
}

export function DeviceMockup({ lightItems, darkItems, type, className }: DeviceMockupProps) {
  const mode = useUIStore((state) => state.mode);

  const items = mode === 'dark' ? darkItems : lightItems;

  const { ref, inView } = useInView();
  const mockupClass = cn('transition-opacity duration-700 ease-out', inView ? 'opacity-100' : 'opacity-0');

  return (
    <div className={cn('relative', mockupClass, className)} ref={ref}>
      {/* Grain shadow grounding the device on its surface. First in DOM, so the device paints over the 70% of it that
          sits behind the device, and the last 30% reaches past the bottom edge. */}
      <div
        aria-hidden="true"
        className={cn(
          'plus-grain pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-25 dark:opacity-20',
          type === 'mobile' ? '-bottom-6 h-20 w-[230%]' : '-bottom-7 h-24 w-[224%]',
        )}
        style={
          {
            '--grain-color': 'var(--foreground)',
            '--grain-size': '5px',
            '--grain-fade': 'radial-gradient(ellipse 50% 50% at 50% 50%, black, rgb(0 0 0 / 0.4) 60%, transparent 78%)',
          } as React.CSSProperties
        }
      />
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
