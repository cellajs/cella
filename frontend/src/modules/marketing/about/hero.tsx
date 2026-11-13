import { type ReactNode, Suspense } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useInView } from '~/hooks/use-in-view';
import type { TKey } from '~/lib/i18n-locales';
import { HeroStack } from '~/modules/marketing/about/hero-stack';
import { BackgroundCurve } from '~/modules/marketing/background-curve';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

interface HeroProps {
  title: TKey;
  children: ReactNode;
  text?: TKey;
}

export function Hero({ title, text, children }: HeroProps) {
  const { t } = useTranslation();
  const theme = useUIStore((state) => state.theme);
  const { ref, inView } = useInView({ once: true, threshold: 0.5 });

  // A theme color derives the gradient from --primary, so any color in appConfig.theme.colors works
  const hasTheme = theme !== 'none';
  const gradientClass = hasTheme ? 'text-transparent' : 'from-slate-200 via-neutral-200 to-stone-300 text-primary/90';
  const gradientStyle = hasTheme
    ? {
        backgroundImage: `linear-gradient(to bottom right,
          color-mix(in oklch, var(--primary), black 30%),
          var(--primary),
          color-mix(in oklch, var(--primary), black 20%))`,
      }
    : undefined;

  return (
    <section
      id="spy-welcome"
      className="rich-gradient relative flex min-h-[90vh] items-center justify-center overflow-x-clip px-4 py-24 [--hero-stack-scale:0.8] max-lg:mb-[calc(376px*var(--hero-stack-scale)_-_4.5rem)] min-[1800px]:mb-36 min-[1800px]:[--hero-stack-scale:1.2] md:[--hero-stack-scale:0.95] lg:mb-20 lg:min-h-[80vh] lg:py-32 lg:[--hero-stack-scale:0.82] xl:min-h-[90vh] xl:[--hero-stack-scale:0.92] 2xl:[--hero-stack-scale:1]"
    >
      <div
        className={cn(
          'relative z-2 container grid justify-items-center gap-2 min-[1800px]:grid-cols-[minmax(0,1fr)_48rem] sm:gap-10 lg:grid-cols-[minmax(0,1fr)_36rem] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_38rem] 2xl:grid-cols-[minmax(0,1fr)_42rem]',
          !inView && '*:translate-y-4 *:scale-95 *:opacity-0',
        )}
      >
        <header
          ref={ref}
          className="relative flex max-w-4xl flex-col items-center gap-4 text-center transition-[opacity,translate,scale] duration-500 ease-out lg:col-start-2 lg:row-start-1 lg:items-start lg:text-start"
        >
          <div className="pointer-events-none absolute inset-0 -z-1 opacity-75" aria-hidden="true">
            <div className="rich-veil-gradient" />
            <div className="rich-veil-background" />
          </div>
          <h1 className="font-heading mb-6 text-3xl leading-10 text-balance min-[1800px]:text-6xl min-[1800px]:leading-18 sm:mt-6 sm:text-4xl sm:leading-13 md:text-5xl md:leading-18 lg:mt-0 lg:text-[2.75rem] lg:leading-13 xl:text-5xl xl:leading-14 2xl:text-[3.25rem] 2xl:leading-16">
            <span className={cn('bg-linear-to-br bg-clip-text font-bold', gradientClass)} style={gradientStyle}>
              {t(title)}
            </span>
          </h1>
          {text && (
            <h2 className="text-foreground mb-8 text-xl leading-8 md:text-2xl md:leading-10 lg:text-xl lg:leading-8 2xl:text-2xl 2xl:leading-10">
              <Trans t={t} i18nKey={text as never} components={{ em: <em />, strong: <strong /> }} />
            </h2>
          )}
          <div>{children}</div>
        </header>
        <div className="relative h-[calc(376px*var(--hero-stack-scale))] w-full transition-[opacity,translate,scale] delay-150 duration-500 ease-out lg:col-start-1 lg:row-start-1 lg:h-auto">
          <HeroStack
            shown={inView}
            className="top-0 left-1/2 origin-top -translate-x-1/2 max-sm:-translate-x-[36%] lg:-top-8 lg:right-0 lg:left-auto lg:origin-top-right lg:translate-x-0 xl:-top-20"
          />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <Suspense fallback={null}>
          <div className="absolute top-[75%] left-1/2 aspect-square w-[min(170vmin,1600px)] -translate-x-1/2 -translate-y-1/2 opacity-20 mix-blend-multiply max-sm:w-[230vmin] dark:opacity-17 dark:mix-blend-normal">
            <MorphAnimation variant="single" grid={300} stamp="plus" speed={0.45} />
          </div>
        </Suspense>
      </div>
      <BackgroundCurve />
    </section>
  );
}
