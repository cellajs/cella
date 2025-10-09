import { cva, type VariantProps } from 'class-variance-authority';
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  isDialog?: boolean;
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: 'horizontal' | 'vertical';
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = React.createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = React.useContext(CarouselContext);

  if (!context) {
    throw new Error('useCarousel must be used within a <Carousel />');
  }

  return context;
}

const Carousel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & CarouselProps>(
  ({ orientation = 'horizontal', opts, setApi, plugins, isDialog = false, className, children, ...props }, ref) => {
    const [carouselRef, api] = useEmblaCarousel(
      {
        ...opts,
        axis: orientation === 'horizontal' ? 'x' : 'y',
      },
      plugins,
    );
    const [canScrollPrev, setCanScrollPrev] = React.useState(false);
    const [canScrollNext, setCanScrollNext] = React.useState(false);

    const onSelect = React.useCallback((api: CarouselApi) => {
      if (!api) return;

      setCanScrollPrev(api.canScrollPrev());
      setCanScrollNext(api.canScrollNext());
    }, []);

    const scrollPrev = React.useCallback(() => {
      api?.scrollPrev();
    }, [api]);

    const scrollNext = React.useCallback(() => {
      api?.scrollNext();
    }, [api]);

    const handleKeyDown = React.useCallback(
      (event: KeyboardEvent) => {
        if (event.key === 'ArrowLeftIcon') {
          event.preventDefault();
          scrollPrev();
        } else if (event.key === 'ArrowRightIcon') {
          event.preventDefault();
          scrollNext();
        }
      },
      [scrollPrev, scrollNext],
    );

    React.useEffect(() => {
      if (!api || !setApi) {
        return;
      }

      setApi(api);
    }, [api, setApi]);

    React.useEffect(() => {
      if (!api) {
        return;
      }

      onSelect(api);
      api.on('reInit', onSelect);
      api.on('select', onSelect);

      return () => {
        api?.off('select', onSelect);
      };
    }, [api, onSelect]);

    // Define the mouse enter handler
    const handleMouseEnter = () => {
      if (api && !isDialog) document.addEventListener('keydown', handleKeyDown);
    };

    // Define the mouse leave handler
    const handleMouseLeave = () => {
      if (!isDialog) document.removeEventListener('keydown', handleKeyDown);
    };

    //remove keydown listener on unmount
    React.useEffect(() => {
      if (!api) return;
      if (isDialog) document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [api]);

    return (
      <CarouselContext.Provider
        value={{
          carouselRef,
          api: api,
          opts,
          orientation: orientation || (opts?.axis === 'y' ? 'vertical' : 'horizontal'),
          scrollPrev,
          scrollNext,
          canScrollPrev,
          canScrollNext,
        }}
      >
        <section
          ref={ref}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn('relative', className)}
          aria-label="Image carousel"
          aria-roledescription="carousel"
          {...props}
        >
          {children}
        </section>
      </CarouselContext.Provider>
    );
  },
);

Carousel.displayName = 'Carousel';

const CarouselContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div ref={carouselRef} className="overflow-hidden h-full">
      <div ref={ref} className={cn('flex', orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col', className)} {...props} />
    </div>
  );
});
CarouselContent.displayName = 'CarouselContent';

const CarouselItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => {
  const { orientation } = useCarousel();

  return (
    // biome-ignore lint/a11y/useSemanticElements: Carousel items are not interactive
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      className={cn('min-w-0 shrink-0 grow-0 basis-full', orientation === 'horizontal' ? 'pl-4' : 'pt-4', className)}
      {...props}
    />
  );
});
CarouselItem.displayName = 'CarouselItem';

const CarouselPrevious = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  ({ className, variant = 'outline', size = 'icon', onClick: passedOnClick, ...props }, ref) => {
    const { orientation, scrollPrev, canScrollPrev } = useCarousel();

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          'absolute h-8 w-8 border-none lg:h-12 lg:w-12 rounded-full',
          orientation === 'horizontal' ? '-left-12 top-1/2 -translate-y-1/2' : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
        disabled={!canScrollPrev}
        onClick={(e) => {
          passedOnClick?.(e);
          scrollPrev();
        }}
        {...props}
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span className="sr-only">Previous slide</span>
      </Button>
    );
  },
);
CarouselPrevious.displayName = 'CarouselPrevious';

const CarouselNext = React.forwardRef<HTMLButtonElement, React.ComponentProps<typeof Button>>(
  ({ className, variant = 'outline', size = 'icon', onClick: passedOnClick, ...props }, ref) => {
    const { orientation, scrollNext, canScrollNext } = useCarousel();

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          'absolute h-8 w-8 border-none lg:h-12 lg:w-12 rounded-full',
          orientation === 'horizontal' ? '-right-12 top-1/2 -translate-y-1/2' : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
          className,
        )}
        disabled={!canScrollNext}
        onClick={(e) => {
          passedOnClick?.(e);
          scrollNext();
        }}
        {...props}
      >
        <ArrowRightIcon className="h-4 w-4" />
        <span className="sr-only">Next slide</span>
      </Button>
    );
  },
);
CarouselNext.displayName = 'CarouselNext';

const dotsVariants = cva('rounded-full transition-all duration-300', {
  variants: {
    size: {
      default: 'h-5 w-5 text-xs',
      sm: 'h-6 w-6 text-sm',
      lg: 'h-7 w-7 text-md',
    },
    gap: {
      default: 'mx-1',
      sm: 'mx-1',
      lg: 'mx-1',
    },
  },
  defaultVariants: {
    size: 'default',
    gap: 'default',
  },
});

interface CarouselDotsProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof dotsVariants> {}

const CarouselDots = React.forwardRef<HTMLDivElement, CarouselDotsProps>(({ className, size, gap, ...props }, ref) => {
  const { api } = useCarousel();
  const [current, setCurrent] = React.useState(0);
  const length = api?.scrollSnapList().length ?? 1;

  React.useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on('select', () => setCurrent(api.selectedScrollSnap()));

    return () => {
      api?.off('select', () => setCurrent(api.selectedScrollSnap()));
    };
  }, [api]);

  return (
    <div ref={ref} role="tablist" className={cn('mx-2 flex justify-center cursor-default', className)} {...props}>
      {Array.from({ length }).map((_, index) => (
        <button
          type="button"
          key={`dot-${
            // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
            index
          }`}
          role="tab"
          aria-selected={current === index ? 'true' : 'false'}
          aria-label={`Slide ${index + 1}`}
          onClick={() => api?.scrollTo(index)}
          className={cn(
            dotsVariants({ size, gap, className }),
            'cursor-pointer leading-3 focus-effect',
            current === index ? 'text-foreground' : 'text-muted',
          )}
        >
          ●
        </button>
      ))}
    </div>
  );
});
CarouselDots.displayName = 'CarouselDots';

export { Carousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious, useCarousel, type CarouselApi };
