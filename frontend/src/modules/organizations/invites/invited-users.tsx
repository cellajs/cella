import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sheet } from '~/modules/common/sheeter/state';
import type { OrganizationInvitesInfo } from '~/types/common';
import { InvitesInfoTable } from './table';

interface Props {
  invitesInfo: OrganizationInvitesInfo[];
}

export const InvitedUsers = ({ invitesInfo }: Props) => {
  const { t } = useTranslation();

  if (!invitesInfo.length) return null;
  const count = useMemo(() => invitesInfo.length, [invitesInfo.length]);

  const openInfoSheet = () => {
    sheet.create(<InvitesInfoTable info={invitesInfo} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:invited_members'),
      description: t('common:invited_members.text', { entity: t('common:organization').toLowerCase() }),
      id: 'invited-users-info',
      scrollableOverlay: true,
      side: 'right',
    });
  };

  return (
    <button
      disabled={count === 0}
      type="button"
      onClick={openInfoSheet}
      className="flex max-sm:hidden rounded text-sm ring-offset-background items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
    >
      {new Intl.NumberFormat('de-DE').format(count)} {count === 1 ? t('common:intite').toLowerCase() : t('common:intites').toLowerCase()}
    </button>
  );
};
