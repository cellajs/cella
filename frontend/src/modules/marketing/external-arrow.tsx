import { ArrowUpRightIcon } from 'lucide-react';
import { cn } from '~/utils/cn';

interface ExternalArrowProps {
  className?: string;
}

/** The arrow after an external link's text; it brightens while its `group/external-link` ancestor is hovered. */
export function ExternalArrow({ className }: ExternalArrowProps) {
  return <ArrowUpRightIcon className={cn('-mt-2 ml-1 inline-block text-primary opacity-50 group-hover/external-link:opacity-100', className)} />;
}
