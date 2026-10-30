import { useRender } from '@base-ui/react/use-render';
import { ChevronRightIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

export function Breadcrumb({ ...props }: React.ComponentProps<'nav'>) {
  const { t } = useTranslation();
  return <nav aria-label={t('c:breadcrumb')} data-slot="breadcrumb" {...props} />;
}

export function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn('wrap-break-word flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm sm:gap-2.5', className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="breadcrumb-item" className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

export function BreadcrumbLink({ render, className, ...props }: useRender.ComponentProps<'a'>) {
  return useRender({
    defaultTagName: 'a',
    render,
    props: {
      'data-slot': 'breadcrumb-link',
      className: cn(
        'focus-effect link-decoration active:link-decoration-strong rounded-sm ring-offset-0 transition-colors hover:text-foreground hover:underline',
        className,
      ),
      ...props,
    },
  });
}

export function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: aria-current="page" represents the current breadcrumb and must not be focusable.
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-normal text-foreground', className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn('[&>svg]:size-3.5', className)} {...props}>
      {children ?? <ChevronRightIcon />}
    </li>
  );
}
