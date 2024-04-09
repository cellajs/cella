import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';

interface SimpleHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SimpleHeader({ heading, text, children, className = '' }: SimpleHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex h-auto flex-col gap-2 md:gap-3', className)}>
        <h1 className="font-heading text-xl md:text-2xl">{t(heading)}</h1>
        {text && <p className="text-muted-foreground font-light text-sm sm:text-base">{t(text)}</p>}
        {children}
    </div>
  );
}
