import type { ReactNode } from 'react';
import { cn } from '~/utils/cn';

/** Centres a mark at a row's end, a count or the muted bell, on the line of the menu's chevrons and icon buttons, however wide the mark is. */
export function RowEndSlot({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex w-4 shrink-0 justify-center', className)}>{children}</span>;
}
