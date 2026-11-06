import type { ReactElement } from 'react';
import { cn } from '~/utils/cn';

export type DeviceType = 'mobile' | 'tablet' | 'pc';

/** Chrome of every drawn device, the /about hero's phone included. */
export const chromeBorder = 'border-zinc-400 dark:border-zinc-700';
export const chromeFill = 'bg-zinc-400 dark:bg-zinc-700';

interface DeviceMockupFrameProps {
  type: DeviceType;
  inView: boolean;
  renderCarousel: (containerClassName: string) => ReactElement;
}

/** A phone, tablet or desktop chassis around a carousel. */
export function DeviceMockupFrame({ type, inView, renderCarousel }: DeviceMockupFrameProps) {
  switch (type) {
    case 'tablet':
      return (
        <div className={cn('relative mx-auto aspect-3/4 rounded-[2.5rem] border-[.88rem]', chromeBorder, chromeFill)}>
          <div className={cn('absolute -inset-s-4 top-20 h-8 w-1 rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-s-4 top-32 h-12 w-1 rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-s-4 top-44 h-12 w-1 rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-e-4 top-36 h-16 w-1 rounded-e-lg', chromeFill)} />
          <div className="size-full cursor-pointer rounded-4xl bg-white dark:bg-zinc-800">{inView && renderCarousel('rounded-4xl')}</div>
        </div>
      );
    case 'pc':
      return (
        <div className="w-full">
          <div className={cn('relative mx-auto mb-[.05rem] aspect-video max-w-[94%] rounded-t-xl border-4', chromeBorder)}>
            <div className="bg-background size-full cursor-pointer rounded-lg">{inView && renderCarousel('rounded-t-lg')}</div>
          </div>
          <div className={cn('relative mx-auto h-3 rounded-t-sm rounded-b-xl md:h-4', chromeFill)}>
            <div className="border-background absolute top-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-b-xl border border-t-0 bg-zinc-500/25 md:h-2 md:w-24 dark:bg-zinc-900/25" />
          </div>
        </div>
      );
    case 'mobile':
      return (
        <div className={cn('relative mx-auto aspect-9/16 h-128 rounded-3xl border-[.6rem] sm:h-160', chromeBorder)}>
          <div className={cn('absolute -inset-s-3 top-20 h-8 w-[.19rem] rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-s-3 top-32 h-12 w-[.19rem] rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-s-3 top-44 h-12 w-[.19rem] rounded-s-lg', chromeFill)} />
          <div className={cn('absolute -inset-e-3 top-36 h-12 w-[.19rem] rounded-e-lg', chromeFill)} />
          <div className="size-full cursor-pointer rounded-2xl bg-zinc-200 dark:bg-zinc-800">{inView && renderCarousel('rounded-2xl')}</div>
        </div>
      );
    default:
      return null;
  }
}
