import { SquarePenIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '~/modules/ui/badge';

interface UnsavedBadgeProps {
  title?: ReactNode;
}

export function UnsavedBadge({ title }: UnsavedBadgeProps) {
  const { t } = useTranslation();
  return (
    <>
      {typeof title === 'string' ? <span>{title}</span> : title}
      <Badge size="sm" soft className="ml-2 in-[.unsaved-changes]:inline-flex hidden gap-2">
        <SquarePenIcon className="size-3" />
        <span className="max-sm:hidden">{t('c:unsaved_changes')}</span>
      </Badge>
    </>
  );
}
