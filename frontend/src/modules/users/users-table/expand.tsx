import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getUserBySlugOrId } from '~/api/users';
import { dateShort } from '~/lib/utils';
import type { User } from '~/types';

const Expand = ({ row }: { row: User }) => {
  const { t } = useTranslation();

  // Get modifiedBy user
  const { data: modifier, isLoading } = useQuery({
    queryKey: ['getUserBySlugOrId', row.modifiedBy],
    queryFn: () => getUserBySlugOrId(row.modifiedBy ?? ''),
    enabled: !!row.modifiedBy,
  });

  return (
    <div className="leading-normal relative font-light flex flex-col gap-4 sm:flex-row sm:gap-12 p-2">
      <div className="grid gap-1 grid-cols-[auto_auto]">
        <div className="font-medium pr-4">ID</div>
        <div>{row.id}</div>
        <div className="font-medium pr-4">Handle</div>
        <div>{row.slug}</div>
      </div>

      <div className="grid gap-1 grid-cols-[auto_auto]">
        <div className="font-medium pr-4">{t('common:modified')}</div>
        <div>{dateShort(row.modifiedAt)}</div>
        <div className="font-medium pr-4">{t('common:modified_by')}</div>
        <div>
          {isLoading && <Loader2 className="animate-spin" size={16} />}
          {modifier ? `${modifier.name} (${modifier.email})` : row.modifiedAt ? t('common:unknown') : '-'}
        </div>
      </div>
    </div>
  );
};

export default Expand;
