import { useTranslation } from 'react-i18next';
import { useHasScrolled } from '~/hooks/use-has-scrolled';
import { cn } from '~/utils/cn';

interface SimpleHeaderProps {
  heading?: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
  /** When true, text collapses when parent has data-sticky="true" (use with group class on parent) */
  collapseText?: boolean;
}

const collapseTextClasses =
  'transition-[max-height,opacity,margin] duration-300 ease-in-out max-h-24 mt-2 md:mt-3 overflow-hidden group-data-[sticky=true]:opacity-0 group-data-[sticky=true]:max-h-0 group-data-[sticky=true]:mt-0';

const expandedTextClasses = 'transition-[max-height,opacity,margin] duration-300 ease-in-out max-h-24 mt-2 md:mt-3';

export const SimpleHeader = ({
  heading,
  text,
  children,
  className = '',
  textClassName = '',
  collapseText,
}: SimpleHeaderProps) => {
  const { t } = useTranslation();
  const hasScrolled = useHasScrolled();
  const useCollapse = collapseText || textClassName;

  return (
    <div className={cn('flex h-auto flex-col', useCollapse ? '' : 'gap-2 md:gap-3', className)}>
      {heading && <h1 className="font-heading text-xl font-semibold">{t(heading)}</h1>}
      {text && (
        <p
          className={cn(
            'text-muted-foreground font-light text-base',
            collapseText && (hasScrolled ? collapseTextClasses : expandedTextClasses),
            textClassName,
          )}
        >
          {t(text)}
        </p>
      )}
      {children}
    </div>
  );
};
