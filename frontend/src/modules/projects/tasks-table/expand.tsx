import { useTranslation } from 'react-i18next';
import { dateShort } from '~/lib/utils';
import type { Task } from '~/modules/common/app/electric';

const Expand = ({ row }: { row: Task }) => {
  const { t } = useTranslation();

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
        <div>{dateShort(row.modified_at)}</div>
        <div className="font-medium pr-4">{t('common:modified_by')}</div>
        <div>-</div>
      </div>
    </div>
  );
};

export default Expand;
