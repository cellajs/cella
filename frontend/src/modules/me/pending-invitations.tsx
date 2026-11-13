import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { meInvitationsQueryOptions, useHandleInvitationMutation } from '~/modules/me/query';
import type { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';
import { tw } from '~/utils/tw';

// From this many on, one row counts them and the rows wait behind it
const summaryFrom = 4;

// The frame of the home page's alert rows; on a phone the buttons wrap to a line of their own
const rowClass = tw('bg-card text-card-foreground flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm');

function InvitationRow({ invitation: { entity, inactiveMembership, organizationName } }: { invitation: Invitation }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutate, isPending, variables } = useHandleInvitationMutation();

  // An accept opens the channel joined, through the link that resolves its route
  const open = () =>
    navigate({
      to: '/n',
      search: { tenantId: entity.tenantId, organizationId: inactiveMembership.organizationId, channelId: entity.id, channelType: entity.entityType },
    });
  const values = {
    inviterName: inactiveMembership.createdBy.name,
    entityName: entity.name,
    organizationName,
    role: t(`c:${inactiveMembership.role}`),
  };

  return (
    <li className={rowClass}>
      <EntityAvatar type={entity.entityType} className="size-8" id={entity.id} name={entity.name} url={entity.thumbnailUrl} />
      <div className="min-w-0 flex-1">
        <p>{t(organizationName ? 'c:invite_accept_as_account_in_organization.text' : 'c:invite_accept_as_account.text', values)}</p>
        <p className="text-muted-foreground">
          {t(`c:${entity.entityType}`)} · {dateShort(inactiveMembership.createdAt, 'day')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-sm:w-full">
        {(['decline', 'accept'] as const).map((action) => (
          <Button
            key={action}
            size="sm"
            variant={action === 'accept' ? 'success' : 'secondary'}
            disabled={isPending}
            loading={isPending && variables?.action === action}
            onClick={() => mutate({ invitationId: inactiveMembership.id, action }, action === 'accept' ? { onSuccess: open } : undefined)}
          >
            {t(`c:${action}`)}
          </Button>
        ))}
      </div>
    </li>
  );
}

/** The signed-in user's invitations, a row each with its answer; from four on, one row counts them and opens the rest. */
export function PendingInvitations() {
  const { t } = useTranslation();
  const { data } = useQuery(meInvitationsQueryOptions());
  const [isOpen, setIsOpen] = useState(false);

  const invitations = data?.results ?? [];
  if (!invitations.length) return null;
  const isSummarized = invitations.length >= summaryFrom;

  return (
    <section aria-label={t('c:pending_invitations')}>
      {isSummarized && (
        <div className={rowClass}>
          <MailIcon className="size-4 shrink-0 translate-y-0.5 self-start" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t('c:pending_invitations_count', { count: invitations.length })}</p>
            <p className="text-muted-foreground">{t('c:pending_invitations_count.text')}</p>
          </div>
          <Button size="sm" variant="secondary" aria-expanded={isOpen} className="max-sm:w-full" onClick={() => setIsOpen(!isOpen)}>
            {t(isOpen ? 'c:show_less' : 'c:show_all')}
          </Button>
        </div>
      )}
      {(!isSummarized || isOpen) && (
        <ul className="flex flex-col gap-3 not-first:mt-3">
          {invitations.map((invitation) => (
            <InvitationRow key={invitation.inactiveMembership.id} invitation={invitation} />
          ))}
        </ul>
      )}
    </section>
  );
}
