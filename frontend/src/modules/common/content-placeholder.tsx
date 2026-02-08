import type { TOptions } from 'i18next';
import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { cn } from '~/utils/cn';

interface Props {
  title: TKey;
  icon?: React.ElementType<LucideProps>;
  className?: string;
  children?: React.ReactNode;
  titleProps?: TOptions & { returnObjects?: false };
}

export function ContentPlaceholder({ title, icon: Icon, className = '', children, titleProps = {} }: Props) {
  const { t } = useTranslation();

  const titleText = t(title, { ...titleProps, returnObjects: false });

  return (
    <div className={cn('flex flex-col items-center w-full text-center p-8 h-full justify-center relative', className)}>
      {Icon && <Icon strokeWidth={0.7} size={80} className="opacity-50" />}
      <p className="mt-4 text-sm opacity-60">{titleText}</p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}
