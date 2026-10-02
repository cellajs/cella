import { useTranslation } from 'react-i18next';
import { useHasScrolled } from '~/hooks/use-has-scrolled';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface SimpleHeaderProps {
  /** i18n key or already-translated text (t() renders non-keys verbatim). */
  heading?: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
  /** When true, text collapses when parent has data-sticky="true" (use with group class on parent) */
  collapseText?: boolean;
}

const collapseTextClasses = tw(
  'mt-2 max-h-24 overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-in-out group-data-[sticky=true]:mt-0 group-data-[sticky=true]:max-h-0 group-data-[sticky=true]:opacity-0 md:mt-3',
);

const expandedTextClasses = tw('mt-2 max-h-24 transition-[max-height,opacity,margin] duration-300 ease-in-out md:mt-3');

export function SimpleHeader({ heading, text, children, className = '', textClassName = '', collapseText }: SimpleHeaderProps) {
  const { t } = useTranslation();
  const hasScrolled = useHasScrolled();
  const useCollapse = collapseText || textClassName;

  return (
    <div className={cn('flex h-auto flex-col', useCollapse ? '' : 'gap-2 md:gap-3', className)}>
      {heading && <h1 className="font-heading font-semibold text-xl">{t(heading as TKey)}</h1>}
      {text && (
        <p
          className={cn('text-base text-muted-foreground', collapseText && (hasScrolled ? collapseTextClasses : expandedTextClasses), textClassName)}
        >
          {t(text as TKey)}
        </p>
      )}
      {children}
    </div>
  );
}
