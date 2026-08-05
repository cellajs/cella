import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

interface ToolCardProps {
  /** i18n key for the card title. */
  label: TKey;
  /** Optional resource i18n key interpolated into the title. */
  resource?: TKey;
  /** Optional description under the title. */
  description?: ReactNode;
  /** Shows the unsaved-changes badge in the title. */
  unsaved?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}

/** Standard card shell for settings tools: titled card with optional description and unsaved badge. */
export function ToolCard({ label, resource, description, unsaved, id, className, children }: ToolCardProps) {
  const { t } = useTranslation();
  const title = t(label, { resource: resource ? t(resource).toLowerCase() : '' });

  return (
    <Card id={id} className={className}>
      <CardHeader>
        <CardTitle>{unsaved ? <UnsavedBadge title={title} /> : title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
