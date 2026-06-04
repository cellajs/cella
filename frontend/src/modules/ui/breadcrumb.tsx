import { ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';
import React from 'react';
import { Slot } from '~/modules/ui/slot';
import { cn } from '~/utils/cn';

function Breadcrumb({ ...props }: React.ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        'wrap-break-word flex flex-wrap items-center gap-1.5 text-muted-foreground text-sm sm:gap-2.5',
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="breadcrumb-item" className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

function BreadcrumbLink({
  render,
  className,
  children,
  ...props
}: React.ComponentProps<'a'> & {
  render?: React.ReactElement;
}) {
  const computedProps = {
    'data-slot': 'breadcrumb-link',
    className: cn('focus-effect rounded-sm ring-offset-0 transition-colors hover:text-foreground', className),
    ...props,
  };

  if (render) {
    return <Slot {...computedProps}>{React.cloneElement(render, undefined, children)}</Slot>;
  }

  return <a {...computedProps}>{children}</a>;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
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

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}

export function BreadcrumbEllipsis({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More</span>
    </span>
  );
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };
