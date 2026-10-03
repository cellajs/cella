import type * as React from 'react';
import { cn } from '~/utils/cn';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('flex flex-col gap-3 rounded-lg border bg-card py-3 text-card-foreground sm:gap-6 sm:py-6', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] sm:px-6 [.border-b]:pb-3 sm:[.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  );
}

/** `level` makes the title a heading (h1 to h4) where it heads a section of the page, so assistive technology can jump to it. */
export function CardTitle({ className, level, ...props }: React.ComponentProps<'div'> & { level?: 1 | 2 | 3 | 4 }) {
  const Tag = (level ? `h${level}` : 'div') as 'div';
  return <Tag data-slot="card-title" className={cn('flex min-h-3 items-center font-semibold leading-none sm:min-h-6', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('wrap-break-word min-w-0 text-muted-foreground text-sm', className)} {...props} />;
}

export function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-3 sm:px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-footer" className={cn('flex items-center px-3 sm:px-6 [.border-t]:pt-3 sm:[.border-t]:pt-6', className)} {...props} />;
}
