import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { sheet } from '~/modules/common/sheeter/state';
import { organizationInvitesInfoQueryOptions } from '~/modules/organizations/query';
import type { OrganizationInvitesInfo } from '~/types/common';

interface Props {
  orgIdOrSlug: string;
}

export const InvitedUsers = ({ orgIdOrSlug }: Props) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { data: info, isError } = useQuery(organizationInvitesInfoQueryOptions(orgIdOrSlug));

  // TODO show message or add to offline access
  if (isError || !isOnline) return null;
  const count = useMemo(() => info?.length ?? 0, [info]);

  const openInfoSheet = () => {
    sheet.create(<InvitesInfo info={info ?? []} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:invited_users'),
      description: t('common:invited_users.text'),
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

const InvitesInfo = ({ info }: { info: OrganizationInvitesInfo }) => (
  <>
    {info.map((el) => (
      <div key={el.id}>
        ID: {el.id}, User ID: {el.userId}, Expired At: {el.expiredAt}, Created At: {el.createdAt}, Created By: {el.createdBy}
      </div>
    ))}
  </>
);
