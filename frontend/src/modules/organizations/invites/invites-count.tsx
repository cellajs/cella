import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sheet } from '~/modules/common/sheeter/state';
import type { OrganizationInvitesInfo } from '~/types/common';

const InvitesInfoTable = lazy(() => import('~/modules/organizations/invites/table'));

interface Props {
  invitesInfo: OrganizationInvitesInfo[];
}

export const InvitedUsers = ({ invitesInfo }: Props) => {
  const { t } = useTranslation();

  const count = useMemo(() => invitesInfo.length, [invitesInfo.length]);

  const openInfoSheet = () => {
    sheet.create(
      <Suspense>
        <InvitesInfoTable info={invitesInfo} />
      </Suspense>,
      {
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:invites_table_title'),
        description: t('common:invites_table_text', { entity: t('common:organization').toLowerCase() }),
        id: 'invited-users-info',
        scrollableOverlay: true,
        side: 'right',
      },
    );
  };
  if (!invitesInfo.length) return null;

  return (
    <button
      disabled={count === 0}
      type="button"
      onClick={openInfoSheet}
      className="flex max-sm:hidden rounded text-sm ring-offset-background items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none"
    >
      {new Intl.NumberFormat('de-DE').format(count)} {count === 1 ? t('common:invite').toLowerCase() : t('common:invites').toLowerCase()}
    </button>
  );
};
