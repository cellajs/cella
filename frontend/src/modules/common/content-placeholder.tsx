import type { TOptions } from 'i18next';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

interface Props {
  title: TKey;
  icon?: IconComponent;
  /** `sm` fits a section inside a card or popup; the default fills a page, tab or table body. */
  size?: 'default' | 'sm';
  className?: string;
  children?: React.ReactNode;
  titleProps?: TOptions & { returnObjects?: false };
}

const defaultTitleProps = {};

export function ContentPlaceholder({ title, icon: Icon, size = 'default', className = '', children, titleProps = defaultTitleProps }: Props) {
  const { t } = useTranslation();

  const titleText = t(title, titleProps as Record<string, unknown>);

  return (
    <div
      data-size={size}
      className={cn('group/placeholder relative flex size-full flex-col items-center justify-center p-8 text-center data-[size=sm]:p-4', className)}
    >
      {/* A thin stroke scales with the icon: the small one gets a heavier stroke to stay as visible. */}
      {Icon && <Icon strokeWidth={size === 'sm' ? 1 : 0.7} className="size-20 opacity-50 group-data-[size=sm]/placeholder:size-10" />}
      {/* Dimmed at rest (still above 4.5:1 on page and card); increased contrast gives it the full muted text color. */}
      <p className="mt-4 more-contrast:text-muted-foreground text-sm more-contrast:opacity-100 opacity-60 group-data-[size=sm]/placeholder:mt-2">
        {titleText}
      </p>
      {children && <div className="mt-8 group-data-[size=sm]/placeholder:mt-4">{children}</div>}
    </div>
  );
}
