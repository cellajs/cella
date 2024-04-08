import { useTranslation } from 'react-i18next';

interface SimpleHeaderProps {
  heading: string;
  text?: string;
  children?: React.ReactNode;
  className?: string;
}

export function SimpleHeader({ heading, text, children, className = '' }: SimpleHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={`container flex h-auto flex-col pt-4 gap-2 md:pt-8 md:gap-4 ${className}`}>
      <div className="grid p-4 gap-1">
        <h1 className="font-heading text-xl md:text-2xl">{t(heading)}</h1>
        {text && <p className="text-muted-foreground font-light text-sm sm:text-base">{t(text)}</p>}
      </div>
      {children}
    </div>
  );
}
