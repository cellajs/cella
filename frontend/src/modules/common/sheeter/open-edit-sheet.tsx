import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { type TriggerRef, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { Card, CardContent } from '~/modules/ui/card';

interface OpenEditSheetOptions {
  id: string;
  /** The edited resource, such as `c:user`. */
  resource: TKey;
  triggerRef: TriggerRef;
  /** The edit form, rendered in the first card. */
  children: ReactNode;
  /** Cards rendered below the form card. */
  after?: ReactNode;
  className?: string;
}

/** Opens a right-side sheet that edits one resource: the form in a card, the title with an unsaved badge. */
export function openEditSheet({
  id,
  resource,
  triggerRef,
  children,
  after,
  className = 'container w-full',
}: OpenEditSheetOptions) {
  const title = i18n.t('c:edit_resource', { resource: i18n.t(resource).toLowerCase() });

  useSheeter.getState().create(
    <div className={className}>
      <Card className={after ? 'mb-4' : 'mb-20'}>
        <CardContent>{children}</CardContent>
      </Card>
      {after}
    </div>,
    {
      id,
      triggerRef,
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title,
      titleContent: <UnsavedBadge title={title} />,
    },
  );
}
