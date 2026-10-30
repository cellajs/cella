import type { ComponentProps } from 'react';
import { cn } from '~/utils/cn';

/** Frame around code. `not-prose` keeps the typography plugin's `pre` styles out of a docs body. */
export function CodeBlock({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block"
      className={cn('not-prose group/code-block relative w-full min-w-0 overflow-hidden rounded-md border bg-muted/50 text-sm', className)}
      {...props}
    />
  );
}

/** Floats its buttons over the frame's top corner, shown on hover and focus, always on a touch screen. */
export function CodeBlockActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block-actions"
      className={cn(
        'absolute inset-e-2 top-2 z-10 flex items-center gap-1 opacity-0 pointer-coarse:opacity-100 transition-opacity group-focus-within/code-block:opacity-100 group-hover/code-block:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

/** The `pre`; children bring their own `code`, highlighted with `code-theme.ts`. Focusable so a keyboard can scroll it sideways. */
export function CodeBlockContent({ className, ...props }: ComponentProps<'pre'>) {
  return (
    <pre
      data-slot="code-block-content"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region has to take keyboard focus.
      tabIndex={0}
      className={cn('focus-effect focus-inset overflow-x-auto px-4 py-3.5 font-mono text-muted-foreground leading-normal', className)}
      {...props}
    />
  );
}
