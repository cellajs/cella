import { CheckIcon } from 'lucide-react';
import type { IconComponent } from '~/modules/common/icons/types';

interface CopiedIconProps {
  /** From `useCopyToClipboard`. */
  copied: boolean;
  icon: IconComponent;
}

/** A copy button's icon: its own at rest, a green check once copied. */
export function CopiedIcon({ copied, icon: Icon }: CopiedIconProps) {
  return copied ? <CheckIcon className="text-success size-3.5" /> : <Icon className="size-3.5" />;
}
