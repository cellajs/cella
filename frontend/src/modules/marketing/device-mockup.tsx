import { useInView } from '~/hooks/use-in-view';
import { AttachmentsCarousel, type CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { DeviceMockupFrame, type DeviceType } from '~/modules/marketing/device-mockup-frame';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

interface DeviceMockupProps {
  lightItems: CarouselItemData[];
  darkItems: CarouselItemData[];
  className?: string;
  type: DeviceType;
}

export function DeviceMockup({ lightItems, darkItems, type, className }: DeviceMockupProps) {
  const mode = useUIStore((state) => state.mode);

  const items = mode === 'dark' ? darkItems : lightItems;

  const { ref, inView } = useInView();

  return (
    <div className={cn('relative transition-opacity duration-700 ease-out', !inView && 'opacity-0', className)} ref={ref}>
      {/* The grain shadow comes first in the DOM, so the device paints over the 70% behind it and the rest shows below the bottom edge */}
      <div
        aria-hidden="true"
        className={cn(
          'plus-grain pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-25 dark:opacity-20',
          type === 'mobile' ? '-bottom-6 h-20 w-[230%]' : '-bottom-7 h-24 w-[224%]',
        )}
        style={{
          '--grain-color': 'var(--foreground)',
          '--grain-size': '5px',
          '--grain-fade': 'radial-gradient(ellipse 50% 50% at 50% 50%, black, rgb(0 0 0 / 0.4) 60%, transparent 78%)',
        }}
      />
      <DeviceMockupFrame
        type={type}
        inView={inView}
        renderCarousel={(containerClassName) => <AttachmentsCarousel items={items} isDialog={false} containerClassName={containerClassName} />}
      />
    </div>
  );
}
