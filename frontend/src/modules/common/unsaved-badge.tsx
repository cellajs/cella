import { SquarePenIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';

/**
 * A badge to indicate that there are unsaved changes.
 */
export function UnsavedBadge({ title }: { title?: string | React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      {typeof title === 'string' ? <span>{title}</span> : title}
      <Badge size="sm" variant="plain" className="ml-2 in-[.unsaved-changes]:inline-flex hidden w-fit gap-2">
        <SquarePenIcon size={12} />
        <span className="max-sm:hidden">{t('c:unsaved_changes')}</span>
      </Badge>
    </>
  );
}
