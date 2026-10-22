import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useHasScrolled } from '~/hooks/use-has-scrolled';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';

interface SimpleHeaderProps {
  /** i18n key or already-translated text (t() renders non-keys verbatim). */
  heading?: string;
  text?: string;
  children?: ReactNode;
  className?: string;
  textClassName?: string;
  /** Collapses the text after a scroll while a `group/sticky` ancestor carries `data-sticky="true"`, as a stuck `StickyBox` does. */
  collapseText?: boolean;
}

export function SimpleHeader({ heading, text, children, className = '', textClassName = '', collapseText }: SimpleHeaderProps) {
  const { t } = useTranslation();
  const hasScrolled = useHasScrolled();
  const textSetsSpacing = collapseText || !!textClassName;

  return (
    <div className={cn('flex flex-col', !textSetsSpacing && 'gap-2 md:gap-3', className)}>
      {heading && <h1 className="font-heading font-semibold text-xl">{t(heading as TKey)}</h1>}
      {text && (
        <p
          className={cn(
            'text-base text-muted-foreground',
            collapseText && 'mt-2 max-h-24 transition-[max-height,opacity,margin] duration-300 ease-in-out md:mt-3',
            collapseText &&
              hasScrolled &&
              'overflow-hidden group-data-[sticky=true]/sticky:mt-0 group-data-[sticky=true]/sticky:max-h-0 group-data-[sticky=true]/sticky:opacity-0',
            textClassName,
          )}
        >
          {t(text as TKey)}
        </p>
      )}
      {children}
    </div>
  );
}
