type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceFrameProps {
  type: DeviceType;
  inView: boolean;
  renderCarousel: (className: string) => React.ReactElement;
}

export function DeviceFrame({ type, inView, renderCarousel }: DeviceFrameProps) {
  switch (type) {
    case 'tablet':
      return (
        <div className="relative mx-auto aspect-3/4 rounded-[2.5rem] border-[.88rem] border-gray-300 bg-gray-300">
          <div className="absolute -inset-s-4 top-20 h-8 w-1 rounded-s-lg bg-gray-300 dark:bg-gray-800" />
          <div className="absolute -inset-s-4 top-32 h-12 w-1 rounded-s-lg bg-gray-300 dark:bg-gray-800" />
          <div className="absolute -inset-s-4 top-44 h-12 w-1 rounded-s-lg bg-gray-300 dark:bg-gray-800" />
          <div className="absolute -inset-e-4 top-36 h-16 w-1 rounded-e-lg bg-gray-300 dark:bg-gray-800" />
          <div className="h-full w-full cursor-pointer rounded-8 bg-white dark:bg-gray-800">
            {inView && renderCarousel('rounded-[2rem]')}
          </div>
        </div>
      );
    case 'pc':
      return (
        <div className="w-full">
          <div className="bord er-gray-400/75 relative mx-auto mb-[.05rem] aspect-video max-w-[85%] rounded-t-xl border-4 dark:border-gray-700">
            <div className="h-full w-full cursor-pointer rounded-lg bg-background">
              {inView && renderCarousel('rounded-t-[.5rem]')}
            </div>
          </div>
          <div className="relative mx-auto h-3 rounded-t-sm rounded-b-xl bg-gray-300 md:h-4 dark:bg-gray-800">
            <div className="absolute top-0 left-1/2 h-1 w-14 -translate-x-1/2 rounded-b-xl border border-background border-t-0 bg-gray-500/25 md:h-2 md:w-24 dark:bg-gray-900/25" />
          </div>
        </div>
      );
    case 'mobile':
      return (
        <div className="relative mx-auto aspect-9/16 h-128 rounded-3xl border-[.6rem] border-gray-300 sm:h-160 dark:border-gray-700">
          <div className="absolute -inset-s-3 top-20 h-8 w-[.19rem] rounded-s-lg bg-gray-200 dark:bg-gray-800" />
          <div className="absolute -inset-s-3 top-32 h-12 w-[.19rem] rounded-s-lg bg-gray-200 dark:bg-gray-800" />
          <div className="absolute -inset-s-3 top-44 h-12 w-[.19rem] rounded-s-lg bg-gray-200 dark:bg-gray-800" />
          <div className="absolute -inset-e-3 top-36 h-12 w-[.19rem] rounded-e-lg bg-gray-200 dark:bg-gray-800" />
          <div className="h-full w-full cursor-pointer rounded-2xl bg-gray-200 dark:bg-gray-800">
            {inView && renderCarousel('rounded-[1rem]')}
          </div>
        </div>
      );
    default:
      return null;
  }
}
