import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon } from 'lucide-react';

export const notifyOptions = [
  { titleKey: 'c:warning', value: 'warning', icon: CircleAlertIcon },
  { titleKey: 'c:error', value: 'error', icon: CircleXIcon },
  { titleKey: 'c:info', value: 'info', icon: InfoIcon },
  { titleKey: 'c:success', value: 'success', icon: CircleCheckIcon },
] as const;
