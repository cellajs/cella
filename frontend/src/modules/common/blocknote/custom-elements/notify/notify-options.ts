import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon } from 'lucide-react';
import type { NotifyType } from 'shared/utils/blocknote-schema-configs';
import type { IconComponent } from '~/modules/common/icons/types';

/** In menu order. */
export const notifyOptions = {
  warning: { titleKey: 'c:warning', icon: CircleAlertIcon },
  error: { titleKey: 'c:error', icon: CircleXIcon },
  info: { titleKey: 'c:info', icon: InfoIcon },
  success: { titleKey: 'c:success', icon: CircleCheckIcon },
} as const satisfies Record<NotifyType, { titleKey: string; icon: IconComponent }>;
