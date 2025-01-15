import { useTranslation } from 'react-i18next';

interface Props {
  count: number;
}

const InvitedUsers = ({ count }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="max-sm:hidden text-muted-foreground text-sm flex items-center">
      {new Intl.NumberFormat('de-DE').format(count)} {count === 1 ? t('common:intite').toLowerCase() : t('common:intites').toLowerCase()}
    </div>
  );
};

export default InvitedUsers;
