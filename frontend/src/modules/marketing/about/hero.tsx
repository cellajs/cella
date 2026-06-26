import { Trans, useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

interface HeroProps {
  title: string;
  children: React.ReactNode;
  text?: string;
  chips?: string[];
}

export const Hero = ({ title, text, children, chips }: HeroProps) => {
  const { t } = useTranslation();
  const { theme } = useUIStore();
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.5,
  });

  // When a theme color is active, derive gradient from --primary CSS variable so any color in appConfig.theme.colors works automatically
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
  const sectionClass =
    'rich-gradient relative flex min-h-[90vh] items-center justify-center space-y-6 py-24 px-4 lg:py-32';
  const headerClass = `transition-all will-change-transform duration-500 ease-out ${inView ? 'opacity-100' : 'opacity-0 scale-95 translate-y-4'}`;

  return (
    <section id="spy-hero" className={sectionClass}>
      <header ref={ref} className={cn('container flex max-w-4xl flex-col items-center gap-4 text-center', headerClass)}>
        <h1 className="mb-6 font-heading text-3xl leading-10 sm:mt-6 sm:text-4xl sm:leading-13 md:text-5xl md:leading-18 lg:text-6xl">
          <span className={`bg-linear-to-br ${gradientClass} bg-clip-text font-bold`} style={gradientStyle}>
            {t(title)}
          </span>
        </h1>
        {text && (
          <h2 className="mx-auto mb-8 max-w-4xl text-foreground/90 text-xl leading-8 md:text-2xl md:leading-10">
            <Trans t={t} i18nKey={text} components={{ em: <em className="italic" />, strong: <strong /> }} />
          </h2>
        )}
        {chips && chips.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-foreground/70">
            {chips.map((chip) => (
              <span key={chip}>{t(chip)}</span>
            ))}
          </div>
        )}
        <div className="">{children}</div>
      </header>
      <BackgroundCurve />
    </section>
  );
};

/**
 * Decorative SVG curve at the edge of a gradient section.
 * Uses absolute positioning inside a `relative` parent for pixel-perfect
 * flush placement regardless of viewport width or resize.
 *
 * @param position - 'bottom' (default): curve at section bottom (gradient → content).
 *                   'top': curve at section top (content → gradient).
 * @param height - CSS height value, e.g. clamp(). Controls curve depth.
 */
export const BackgroundCurve = ({
  height = 'clamp(3rem, 8vw, 8rem)',
  position = 'bottom',
}: {
  height?: string;
  position?: 'top' | 'bottom';
}) => {
  const isTop = position === 'top';

  return (
    <svg
      viewBox="0 0 800 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-x-0 w-full ${isTop ? '-top-px' : '-bottom-px'}`}
      style={{ height: `calc(${height} + 1px)` }}
      aria-hidden="true"
    >
      <path
        fill="var(--background)"
        d={isTop ? 'M 0 0 L 800 0 L 800 100 Q 400 20 0 100 Z' : 'M 0 100 L 0 0 Q 400 80 800 0 L 800 100 Z'}
      />
    </svg>
  );
};
