import { type ReactNode, Suspense } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useInView } from '~/hooks/use-in-view';
import type { TKey } from '~/lib/i18n-locales';
import { BackgroundCurve } from '~/modules/marketing/background-curve';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';
import { lazyNamed } from '~/utils/lazy-named';

const MorphAnimation = lazyNamed(() => import('~/modules/common/morph-animation/morph-animation'), 'MorphAnimation');

interface HeroProps {
  title: TKey;
  children: ReactNode;
  text?: TKey;
  chips?: TKey[];
}

export function Hero({ title, text, children, chips }: HeroProps) {
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
    <section id="spy-welcome" className="rich-gradient relative flex min-h-[90vh] items-center justify-center overflow-hidden px-4 py-24 lg:py-32">
      <header
        ref={ref}
        className={cn(
          'container relative z-2 flex max-w-4xl flex-col items-center gap-4 text-center transition-[opacity,translate,scale] duration-500 ease-out',
          // Soft halo behind the text so it keeps contrast over the animation
          'before:absolute before:-inset-x-12 before:-inset-y-16 before:z-[-1] before:rounded-full before:bg-background/40 before:blur-3xl',
          !inView && 'translate-y-4 scale-95 opacity-0',
        )}
      >
        <h1 className="mb-6 font-heading text-3xl leading-10 sm:mt-6 sm:text-4xl sm:leading-13 md:text-5xl md:leading-18 lg:text-6xl">
          <span className={cn('bg-linear-to-br bg-clip-text font-bold', gradientClass)} style={gradientStyle}>
            {t(title)}
          </span>
        </h1>
        {text && (
          <h2 className="mx-auto mb-8 max-w-4xl text-foreground text-xl leading-8 md:text-2xl md:leading-10">
            <Trans t={t} i18nKey={text as never} components={{ em: <em />, strong: <strong /> }} />
          </h2>
        )}
        {chips && chips.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-muted-foreground">
            {chips.map((chip) => (
              <span key={chip}>{t(chip)}</span>
            ))}
          </div>
        )}
        <div>{children}</div>
      </header>
      {/* The curve and the headline paint over it; a phone draws it larger, so the section crops more of it */}
      <Suspense fallback={null}>
        <div
          className="pointer-events-none absolute top-1/2 left-[12%] aspect-square w-[min(144vmin,1182px)] -translate-x-1/2 -translate-y-1/2 opacity-20 mix-blend-multiply max-sm:w-[174vmin] dark:mix-blend-normal"
          aria-hidden="true"
        >
          {/* A finer grid than the auth colony's: on this larger canvas it keeps the grain about the same size */}
          <MorphAnimation variant="single" grid={230} stamp="plus" />
        </div>
      </Suspense>
      <BackgroundCurve />
    </section>
  );
}
