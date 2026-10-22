import { CheckIcon } from 'lucide-react';
import type { IconComponent } from '~/modules/common/icons/types';

interface CopiedIconProps {
  /** From `useCopyToClipboard`: true for a moment after a copy worked. */
  copied: boolean;
  /** Shown at rest. */
  icon: IconComponent;
}

/** The icon of a small copy button: its own icon at rest, a green check while the copy shows as done. */
export function CopiedIcon({ copied, icon: Icon }: CopiedIconProps) {
  return copied ? <CheckIcon className="size-3.5 text-success" /> : <Icon className="size-3.5" />;
}
