import { CircleAlertIcon, CircleCheckIcon, CircleXIcon, InfoIcon } from 'lucide-react';

export const notifyOptions = [
  { title: 'Warning', value: 'warning', icon: CircleAlertIcon },
  { title: 'Error', value: 'error', icon: CircleXIcon },
  { title: 'Info', value: 'info', icon: InfoIcon },
  { title: 'Success', value: 'success', icon: CircleCheckIcon },
] as const;
