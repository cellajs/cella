export type DeviceType = 'mobile' | 'tablet' | 'pc';

interface DeviceFrameProps {
  type: DeviceType;
  inView: boolean;
  renderCarousel: (isDialog: boolean) => JSX.Element;
}

const DeviceFrame = ({ type, inView, renderCarousel }: DeviceFrameProps) => {
  switch (type) {
    case 'tablet':
      return (
        <div className="relative mx-auto border-gray-800 bg-gray-800 border-[.88rem] rounded-[2.5rem] aspect-[3/4]">
          <div className="h-8 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-20 rounded-s-lg" />
          <div className="h-12 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-32 rounded-s-lg" />
          <div className="h-12 w-1 bg-gray-800 dark:bg-gray-800 absolute -start-4 top-44 rounded-s-lg" />
          <div className="h-16 w-1 bg-gray-800 dark:bg-gray-800 absolute -end-4 top-36 rounded-e-lg" />
          <div className="rounded-[2rem] bg-white dark:bg-gray-800 h-full w-full cursor-pointer">{inView && renderCarousel(false)}</div>
        </div>
      );
    case 'pc':
      return (
        <div className="w-full">
          <div className="relative mx-auto border-gray-400/75 mb-[.07rem] dark:border-gray-600 border-[.25rem] rounded-t-xl max-w-[85%] aspect-video">
            <div className="rounded-lg h-full w-full bg-background cursor-pointer">{inView && renderCarousel(false)}</div>
          </div>
          <div className="relative mx-auto bg-gray-300 dark:bg-gray-700 rounded-b-xl rounded-t-sm h-4 md:h-5">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-xl w-14 h-1 md:w-24 md:h-2 bg-gray-500/25 dark:bg-gray-900/25 border-background border border-t-0" />
          </div>
        </div>
      );
    case 'mobile':
      return (
        <div className="relative mx-auto border-gray-800 dark:border-gray-800 bg-gray-800 border-[.88rem] rounded-[2.5rem] aspect-[1/2]">
          <div className="h-8 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-20 rounded-s-lg" />
          <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-32 rounded-s-lg" />
          <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -start-4 top-44 rounded-s-lg" />
          <div className="h-12 w-[.19rem] bg-gray-800 dark:bg-gray-800 absolute -end-4 top-36 rounded-e-lg" />
          <div className="rounded-8 w-72 h-[39rem] bg-white dark:bg-gray-800 cursor-pointer">{inView && renderCarousel(false)}</div>
        </div>
      );
    default:
      return null;
  }
};

export default DeviceFrame;
