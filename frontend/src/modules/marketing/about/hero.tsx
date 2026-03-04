import { Trans, useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { Badge } from '~/modules/ui/badge';
import { useUIStore } from '~/store/ui';

interface HeroProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  text?: string;
  badgeText?: string;
}

export const Hero = ({ title, subtitle, text, children, badgeText }: HeroProps) => {
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
      <header ref={ref} className={headerClass}>
        <div className="container flex max-w-5xl flex-col items-center gap-4 text-center">
          {badgeText && (
            <Badge variant="plain" size="sm" className="max-sm:hidden">
              {t(badgeText)}
            </Badge>
          )}
          <h1 className="font-heading text-primary leading-12 sm:leading-16 md:leading-20 mt-6 mb-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
            {title && <span className="font-semibold">{t(title)}</span>}
            {title && subtitle && <br />}
            {subtitle && (
              <span className={`bg-linear-to-br ${gradientClass} bg-clip-text font-bold`} style={gradientStyle}>
                {t(subtitle)}
              </span>
            )}
          </h1>
          {text && (
            <h2 className="text-foreground/80 mx-auto mb-8 max-w-3xl text-xl md:text-2xl md:leading-10">
              <Trans t={t} i18nKey={text} components={{ strong: <strong /> }} />
            </h2>
          )}
          <div className="">{children}</div>
        </div>
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
