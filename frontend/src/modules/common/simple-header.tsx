import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/utils';

interface SimpleHeaderProps {
  heading?: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SimpleHeader({ heading, text, children, className = '' }: SimpleHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex h-auto flex-col gap-2 md:gap-3', className)}>
      {heading && <h1 className="font-heading text-xl font-semibold">{t(heading)}</h1>}
      {text && <p className="text-muted-foreground font-light text-base">{t(text)}</p>}
      {children}
    </div>
  );
}
