type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceFrameProps {
  type: DeviceType;
  inView: boolean;
  renderCarousel: (className: string) => React.ReactElement;
}

/**
 * Draws the chassis around a carousel: a phone, a tablet or a desktop screen on a stand.
 *
 * Chassis neutrals are zinc, not Tailwind's blue-leaning gray. The theme tokens and the grain shadow the mockup
 * casts (device-mockup.tsx, `--grain-color: --foreground`) share zinc's hue, so gray reads as a blue cast on it.
 * Every surface is opaque: the grain sits behind the device, and a translucent one lets its dots through.
 */
export function DeviceFrame({ type, inView, renderCarousel }: DeviceFrameProps) {
  switch (type) {
    case 'tablet':
      return (
        <div className="relative mx-auto aspect-3/4 rounded-[2.5rem] border-[.88rem] border-zinc-300 bg-zinc-300">
          <div className="absolute -inset-s-4 top-20 h-8 w-1 rounded-s-lg bg-zinc-300 dark:bg-zinc-800" />
          <div className="absolute -inset-s-4 top-32 h-12 w-1 rounded-s-lg bg-zinc-300 dark:bg-zinc-800" />
          <div className="absolute -inset-s-4 top-44 h-12 w-1 rounded-s-lg bg-zinc-300 dark:bg-zinc-800" />
          <div className="absolute -inset-e-4 top-36 h-16 w-1 rounded-e-lg bg-zinc-300 dark:bg-zinc-800" />
          <div className="size-full cursor-pointer rounded-4xl bg-white dark:bg-zinc-800">{inView && renderCarousel('rounded-4xl')}</div>
        </div>
      );
    case 'pc':
      return (
        <div className="w-full">
          <div className="relative mx-auto mb-[.05rem] aspect-video max-w-[85%] rounded-t-xl border-4 border-zinc-400 dark:border-zinc-700">
            <div className="size-full cursor-pointer rounded-lg bg-background">{inView && renderCarousel('rounded-t-[.5rem]')}</div>
          </div>
          {/* Base takes the bezel's color, so the chassis reads as one piece */}
          <div className="relative mx-auto h-3 rounded-t-sm rounded-b-xl bg-zinc-400 md:h-4 dark:bg-zinc-700">
            <div className="absolute top-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-b-xl border border-background border-t-0 bg-zinc-500/25 md:h-2 md:w-24 dark:bg-zinc-900/25" />
          </div>
        </div>
      );
    case 'mobile':
      return (
        <div className="relative mx-auto aspect-9/16 h-128 rounded-3xl border-[.6rem] border-zinc-300 sm:h-160 dark:border-zinc-700">
          <div className="absolute -inset-s-3 top-20 h-8 w-[.19rem] rounded-s-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="absolute -inset-s-3 top-32 h-12 w-[.19rem] rounded-s-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="absolute -inset-s-3 top-44 h-12 w-[.19rem] rounded-s-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="absolute -inset-e-3 top-36 h-12 w-[.19rem] rounded-e-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="size-full cursor-pointer rounded-2xl bg-zinc-200 dark:bg-zinc-800">{inView && renderCarousel('rounded-2xl')}</div>
        </div>
      );
    default:
      return null;
  }
}
