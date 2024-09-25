import { CheckCircle, Info, OctagonX, TriangleAlert } from 'lucide-react';

// The types of notifies that users can choose from.
export const notifyTypes = [
  {
    title: 'Warning',
    value: 'warning',
    icon: TriangleAlert,
    color: '#e69819',
    backgroundColor: {
      light: '#fff6e6',
      dark: '#805d20',
    },
  },
  {
    title: 'Error',
    value: 'error',
    icon: OctagonX,
    color: '#d80d0d',
    backgroundColor: {
      light: '#ffe6e6',
      dark: '#802020',
    },
  },
  {
    title: 'Info',
    value: 'info',
    icon: Info,
    color: '#507aff',
    backgroundColor: {
      light: '#e6ebff',
      dark: '#203380',
    },
  },
  {
    title: 'Success',
    value: 'success',
    icon: CheckCircle,
    color: '#0bc10b',
    backgroundColor: {
      light: '#e6ffe6',
      dark: '#208020',
    },
  },
] as const;
