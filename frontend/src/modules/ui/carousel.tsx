import { cva, type VariantProps } from 'class-variance-authority';
import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useEventListener } from '~/hooks/use-event-listener';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export type CarouselApi = UseEmblaCarouselType[1];
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

function Carousel({
  orientation = 'horizontal',
  isDialog = false,
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & CarouselProps) {
  const { t } = useTranslation();
  const [carouselRef, api] = useEmblaCarousel({ ...opts, axis: orientation === 'horizontal' ? 'x' : 'y' }, plugins);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const scrollPrev = () => {
    api?.scrollPrev();
  };

  const scrollNext = () => {
    api?.scrollNext();
  };

  // Once per api: a setApi registers listeners on it, and an inline prop changes every render.
  const notifyApi = React.useEffectEvent((api: CarouselApi) => setApi?.(api));
  React.useEffect(() => {
    if (api) notifyApi(api);
  }, [api]);

  React.useEffect(() => {
    if (!api) return;
    onSelect(api);
    api.on('reInit', onSelect);
    api.on('select', onSelect);

    return () => {
      api.off('reInit', onSelect);
      api.off('select', onSelect);
    };
  }, [api, onSelect]);

  // Arrow keys page the carousel in a dialog, or while the pointer or focus is inside it; text fields keep their arrows.
  const [pointerInside, setPointerInside] = React.useState(false);
  const [focusInside, setFocusInside] = React.useState(false);
  const arrowKeysActive = !!api && (isDialog || pointerInside || focusInside);

  useEventListener(
    'keydown',
    (event) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    { enabled: arrowKeysActive },
  );

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
      <div
        onMouseEnter={() => setPointerInside(true)}
        onMouseLeave={() => setPointerInside(false)}
        onFocus={() => setFocusInside(true)}
        onBlur={(event) => {
          if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setFocusInside(false);
        }}
        className={cn('relative', className)}
        role="region"
        aria-roledescription={t('c:carousel')}
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div ref={carouselRef} className="h-full overflow-hidden" data-slot="carousel-content">
      <div className={cn('flex', orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col', className)} {...props} />
    </div>
  );
}

function CarouselItem({ className, ...props }: React.ComponentProps<'div'>) {
  const { t } = useTranslation();
  const { orientation } = useCarousel();

  return (
    <div
      role="group"
      aria-roledescription={t('c:slide')}
      data-slot="carousel-item"
      className={cn('min-w-0 shrink-0 grow-0 basis-full', orientation === 'horizontal' ? 'pl-4' : 'pt-4', className)}
      {...props}
    />
  );
}

function CarouselPrevious({ className, variant = 'outline', size = 'icon', ...props }: React.ComponentProps<typeof Button>) {
  const { t } = useTranslation();
  const { orientation, scrollPrev, canScrollPrev } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        'absolute size-8 rounded-full',
        orientation === 'horizontal' ? 'top-1/2 -left-12 -translate-y-1/2' : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ArrowLeftIcon />
      <span className="sr-only">{t('c:previous_slide')}</span>
    </Button>
  );
}

function CarouselNext({ className, variant = 'outline', size = 'icon', ...props }: React.ComponentProps<typeof Button>) {
  const { t } = useTranslation();
  const { orientation, scrollNext, canScrollNext } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        'absolute size-8 rounded-full',
        orientation === 'horizontal' ? 'top-1/2 -right-12 -translate-y-1/2' : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
        className,
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ArrowRightIcon />
      <span className="sr-only">{t('c:next_slide')}</span>
    </Button>
  );
}

const carouselDotsVariants = cva('group/dot focus-effect relative mx-1 flex cursor-pointer items-center justify-center rounded-full', {
  variants: {
    size: { default: 'size-5', sm: 'size-6', lg: 'size-7' },
    gap: { default: '', sm: '', lg: '' },
  },
  defaultVariants: { size: 'default', gap: 'default' },
});

interface CarouselDotsProps extends React.ComponentProps<'div'>, VariantProps<typeof carouselDotsVariants> {}

function CarouselDots({ className, size, gap, ...props }: CarouselDotsProps) {
  const { t } = useTranslation();
  const { api } = useCarousel();
  const [current, setCurrent] = React.useState(0);
  const length = api?.scrollSnapList().length ?? 1;

  React.useEffect(() => {
    if (!api) return;
    const handleSelect = () => setCurrent(api.selectedScrollSnap());
    handleSelect();
    api.on('select', handleSelect);

    return () => {
      api.off('select', handleSelect);
    };
  }, [api]);

  return (
    // ::before widens the hover zone without layout (z-10 lifts it over a device bezel); the positioned buttons paint above it and keep their clicks.
    <div
      role="tablist"
      className={cn(
        'group/dots relative z-10 mx-auto flex w-fit cursor-default justify-center before:absolute before:-inset-x-8 before:-inset-y-4',
        className,
      )}
      {...props}
    >
      {Array.from({ length }).map((_, index) => (
        <button
          type="button"
          // biome-ignore lint/suspicious/noArrayIndexKey: one dot per snap point, positional and never reordered.
          key={index}
          role="tab"
          aria-selected={current === index}
          aria-label={t('c:slide_number', { number: index + 1 })}
          onClick={() => api?.scrollTo(index)}
          className={carouselDotsVariants({ size, gap })}
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-coarse:size-[45%] size-[30%] rounded-full transition-[width,height,background-color] duration-200 group-hover/dots:size-[45%] group-has-focus-visible/dots:size-[45%]',
              current === index ? 'bg-foreground' : 'bg-muted-foreground/40 group-hover/dot:bg-muted-foreground',
            )}
          />
        </button>
      ))}
    </div>
  );
}

export { Carousel, CarouselContent, CarouselDots, CarouselItem, CarouselNext, CarouselPrevious };
