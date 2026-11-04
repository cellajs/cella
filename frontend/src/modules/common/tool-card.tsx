import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { cn } from '~/utils/cn';

interface ToolCardProps {
  /** Without it the card has no header. */
  label?: TKey;
  /** Interpolated into the title as `resource`. */
  resource?: TKey;
  description?: ReactNode;
  unsaved?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** A settings section; below `sm` it drops the card chrome, as native settings do. */
export function ToolCard({ label, resource, description, unsaved, id, className, children }: ToolCardProps) {
  const { t } = useTranslation();
  const title = label && t(label, { resource: resource ? t(resource) : '' });

  return (
    <Card id={id} className={cn('max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent', className)}>
      {title && (
        <CardHeader className="max-sm:px-0">
          <CardTitle level={2}>{unsaved ? <UnsavedBadge title={title} /> : title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent className="max-sm:px-0">{children}</CardContent>
    </Card>
  );
}
