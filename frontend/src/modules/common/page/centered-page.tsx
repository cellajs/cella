import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

/** A page whose content sits in the middle of the window and enters as one; content taller than the window starts below the top padding. */
export function CenteredPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center pt-8 pb-[10svh] md:pt-12">
      <div className={cn('page-enter w-full', className)}>{children}</div>
    </div>
  );
}
