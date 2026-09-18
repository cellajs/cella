import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useStepper } from '~/modules/common/stepper/stepper';
import { meInvitationsQueryOptions, useHandleInvitationMutation } from '~/modules/me/query';
import { organizationQueryKeys } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { queryClient } from '~/query/query-client';

/**
 * Lets an invited user answer each pending invitation, always by an explicit click: an invitation claimed by its
 * address was never opened by this user. Moves on once the last one is answered.
 */
export function InvitationsStep({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const { data } = useQuery(meInvitationsQueryOptions());
  const invitations = data?.items ?? [];

  const { mutate: handleInvitation, isPending } = useHandleInvitationMutation();

  // Only an answer given here moves on; revisiting the step with nothing left stays put.
  const previousCount = useRef(invitations.length);
  useEffect(() => {
    if (previousCount.current > 0 && invitations.length === 0) nextStep();
    previousCount.current = invitations.length;
  }, [invitations.length]);

  const answer = (id: string, acceptOrReject: 'accept' | 'reject') =>
    handleInvitation(
      { path: { id, acceptOrReject } },
      {
        // The completed screen reads the organization list, which a new membership changes.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: organizationQueryKeys.list.base }),
      },
    );

  return (
    <div className="flex flex-col gap-4">
      {invitations.length === 0 && <p className="font-normal text-sm opacity-80">{t('c:no_invitations_left.text')}</p>}

      <ul className="flex flex-col gap-3">
        {invitations.map(({ entity, inactiveMembership }) => (
          <li key={inactiveMembership.id} className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <div className="flex min-w-0 grow items-center gap-3">
              <EntityAvatar
                type={entity.entityType}
                className="size-10 shrink-0"
                id={entity.id}
                name={entity.name}
                url={entity.thumbnailUrl}
              />
              <p className="min-w-0 text-sm">
                {t('c:invite_accept_as_account.text', {
                  inviterName: inactiveMembership.createdBy?.name ?? t('c:unknown'),
                  entityName: entity.name,
                  role: t(`c:${inactiveMembership.role}`).toLowerCase(),
                })}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="success"
                className="max-sm:w-full"
                disabled={isPending}
                onClick={() => answer(inactiveMembership.id, 'accept')}
              >
                {t('c:accept')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="max-sm:w-full"
                disabled={isPending}
                onClick={() => answer(inactiveMembership.id, 'reject')}
              >
                {t('c:reject')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}
