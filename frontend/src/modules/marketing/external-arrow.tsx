import { ArrowUpRightIcon } from 'lucide-react';
import { cn } from '~/utils/cn';

interface ExternalArrowProps {
  className?: string;
}

/** The arrow after an external link's text; it brightens while the nearest `group` is hovered. */
export function ExternalArrow({ className }: ExternalArrowProps) {
  return <ArrowUpRightIcon className={cn('-mt-2 ml-1 inline-block text-primary opacity-50 group-hover:opacity-100', className)} />;
}
