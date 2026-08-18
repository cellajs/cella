import type { TOptions } from 'i18next';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

interface Props {
  title: TKey;
  icon?: IconComponent;
  className?: string;
  children?: React.ReactNode;
  titleProps?: TOptions & { returnObjects?: false };
}

const defaultTitleProps = {};

export function ContentPlaceholder({
  title,
  icon: Icon,
  className = '',
  children,
  titleProps = defaultTitleProps,
}: Props) {
  const { t } = useTranslation();

  const titleText = t(title, titleProps as Record<string, unknown>);

  return (
    <div className={cn('relative flex h-full w-full flex-col items-center justify-center p-8 text-center', className)}>
      {Icon && <Icon strokeWidth={0.7} className="size-20 opacity-50" />}
      <p className="mt-4 text-sm opacity-60">{titleText}</p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  );
}
