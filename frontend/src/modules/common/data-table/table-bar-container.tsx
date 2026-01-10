import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

export const TableBarContainer = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('flex items-center max-sm:justify-between md:gap-2 mt-4', className)}>{children}</div>
);
