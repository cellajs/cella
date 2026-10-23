import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import type { InviteOutcome } from 'sdk';
import { useDebounce } from '~/hooks/use-debounce';
import type { EnrichedChannel } from '~/modules/entities/types';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';

/** How an address shows before sending: as checking, invited before, already a member, or plain (new). */
export type InviteState = 'checking' | 'invited' | 'member' | 'new';

/**
 * What an invite would do with each address, checked a moment after the list stops changing, so a chip says whether
 * its address was invited before or is already a member. Without a channel (a system invite) every address is new.
 */
export function useInviteCheck(channel: EnrichedChannel | undefined, emails: string[]) {
  const settled = useDebounce(emails, 300);
  const sorted = useMemo(() => [...new Set(settled.map((email) => email.toLowerCase()))].sort(), [settled]);
  const { data, isFetching } = useQuery({ ...inviteCheckQueryOptions(channel, sorted), placeholderData: keepPreviousData });

  const byEmail = useMemo(() => new Map((data ?? []).map((outcome) => [outcome.email, outcome])), [data]);

  const outcomeOf = (email: string) => byEmail.get(email.toLowerCase());
  const stateOf = (email: string): InviteState => {
    const outcome = outcomeOf(email);
    if (outcome?.outcome === 'member') return 'member';
    if (outcome?.outcome === 'remind') return 'invited';
    if (!outcome && channel && (isFetching || settled !== emails)) return 'checking';
    return 'new';
  };

  const counts = { invite: 0, remind: 0, member: 0 };
  for (const email of emails) {
    const state = stateOf(email);
    if (state === 'member') counts.member++;
    else if (state === 'invited') counts.remind++;
    else counts.invite++;
  }

  return { outcomeOf, stateOf, counts };
}

const day = (date: string) => dayjs.utc(date).local().format('D MMM');

/** The note after an address invited before or already a member ("invited 20 Oct", "declined 12 Oct", "member"). */
export const inviteNote = (outcome: InviteOutcome | undefined, t: TFunction) => {
  if (outcome?.outcome === 'member') return t('c:member').toLowerCase();
  if (outcome?.outcome !== 'remind') return undefined;
  if (outcome.declinedAt) return t('c:declined_on', { date: day(outcome.declinedAt) });
  return outcome.invitedAt ? t('c:invited_on', { date: day(outcome.invitedAt) }) : undefined;
};
