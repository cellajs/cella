import { SquarePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';

/**
 * A badge to indicate that there are unsaved changes.
 */
function UnsavedBadge({ title }: { title?: string | React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-row gap-2 items-center">
      {typeof title === 'string' ? <span>{title}</span> : title}
      <Badge size="sm" variant="plain" className="w-fit [.unsaved-changes_&]:flex hidden gap-2">
        <SquarePen size={12} />
        <span className="max-sm:hidden font-light">{t('common:unsaved_changes')}</span>
      </Badge>
    </div>
  );
}

export default UnsavedBadge;
