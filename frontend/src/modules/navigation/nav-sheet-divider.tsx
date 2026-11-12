import { cn } from '~/utils/cn';

/** The line that divides a nav sheet: under a menu sheet's organization and above the sheet's panels, the color of the line under a page's tabs. */
export function NavSheetDivider({ className }: { className?: string }) {
  return <div aria-hidden className={cn('bg-border mx-3 h-px shrink-0', className)} />;
}
