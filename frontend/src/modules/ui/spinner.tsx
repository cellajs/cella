import { LoaderCircleIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

/** Spinning loader announced as a status, so screen readers hear "Loading" when it appears. */
export function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  const { t } = useTranslation();
  return <LoaderCircleIcon role="status" aria-label={t('c:loading')} data-slot="spinner" className={cn('animate-spin', className)} {...props} />;
}
