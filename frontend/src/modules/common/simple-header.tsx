import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasScrolled } from '~/hooks/use-has-scrolled';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';

interface SimpleHeaderProps {
  heading?: TKey;
  text?: TKey;
  children?: ReactNode;
  className?: string;
  /** Collapses the text after a scroll inside a stuck `StickyBox` (`group/sticky`). */
  collapseText?: boolean;
}

export function SimpleHeader({ heading, text, children, className = '', collapseText }: SimpleHeaderProps) {
  const { t } = useTranslation();
  const hasScrolled = useHasScrolled();

  return (
    <div className={cn('flex flex-col', !collapseText && 'gap-1', className)}>
      {heading && <h1 className="font-heading text-xl font-semibold">{t(heading)}</h1>}
      {text && (
        <p
          className={cn(
            'text-muted-foreground text-sm',
            collapseText && 'mt-1 max-h-24 transition-[max-height,opacity,margin] duration-300 ease-in-out',
            collapseText &&
              hasScrolled &&
              'overflow-hidden group-data-[sticky=true]/sticky:mt-0 group-data-[sticky=true]/sticky:max-h-0 group-data-[sticky=true]/sticky:opacity-0',
          )}
        >
          {t(text)}
        </p>
      )}
      {children}
    </div>
  );
}
