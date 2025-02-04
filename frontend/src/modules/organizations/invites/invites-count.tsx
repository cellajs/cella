import { Suspense, lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { sheet } from '~/modules/common/sheeter/state';
import type { OrganizationInvites } from '~/modules/organizations/types';

const InvitesTable = lazy(() => import('~/modules/organizations/invites/table'));

interface Props {
  invites: OrganizationInvites[];
}

export const InvitedUsers = ({ invites }: Props) => {
  const { t } = useTranslation();

  const count = useMemo(() => invites.length, [invites.length]);

  const openInfoSheet = () => {
    sheet.create(
      <Suspense>
        <InvitesTable info={invites} />
      </Suspense>,
      {
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:pending_invitations'),
        description: t('common:pending_invitations.text', { entity: t('common:organization').toLowerCase() }),
        id: 'invites-sheet',
        scrollableOverlay: true,
        side: 'right',
      },
    );
  };
  if (!invites.length) return null;

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
