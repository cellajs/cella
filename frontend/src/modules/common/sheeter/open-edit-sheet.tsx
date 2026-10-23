import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { TKey } from '~/lib/i18n-locales';
import { sheeter, type TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { ToolCard } from '~/modules/common/tool-card';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { tw } from '~/utils/tw';

interface OpenEditSheetOptions {
  id: string;
  /** The edited resource, such as `c:user`. */
  resource: TKey;
  triggerRef: TriggerRef;
  /** The edit form, rendered in the first card. */
  children: ReactNode;
  /**
   * Titles the first card as a section, such as `c:general`, for a sheet with more sections below. The card then
   * carries its own unsaved badge, toggled by a form whose `formContainerId` is `section.id`.
   */
  section?: { label: TKey; id: string };
  /** Cards rendered below the form card. */
  after?: ReactNode;
  className?: string;
}

/** Opens a right-side sheet that edits one resource: the form in a card, the title (or the section card) with an unsaved badge. */
export function openEditSheet({ id, resource, triggerRef, children, section, after, className = tw('container w-full') }: OpenEditSheetOptions) {
  const title = i18n.t('c:edit_resource', { resource: i18n.t(resource).toLowerCase() });
  const cardClass = after ? 'mb-4' : 'mb-20';

  sheeter.getState().create(
    <div className={className}>
      <ToolCard label={section?.label} unsaved={!!section} id={section?.id} className={cardClass}>
        {children}
      </ToolCard>
      {after}
    </div>,
    {
      id,
      triggerRef,
      side: 'right',
      className: tw('max-w-full lg:max-w-4xl'),
      title,
      // A sectioned sheet shows the badge per section, on the card the form marks.
      titleContent: section ? undefined : <UnsavedBadge title={title} />,
    },
  );
}
