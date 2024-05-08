import { Badge } from '../ui/badge';
import { SquarePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function UnsavedBadge({ title }: { title?: string | React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-row gap-2">
      {typeof title === 'string' ? <span>{title}</span> : title}
      <Badge variant="plain" className="w-fit">
        <SquarePen size={12} className="mr-2" />
        <span className="font-light">{t('common:unsaved_changes')}</span>
      </Badge>
    </div>
  );
}

export default UnsavedBadge;
