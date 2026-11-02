import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { InviteOutcome } from 'sdk';
import { appConfig } from 'shared';
import { declineHolds } from 'shared/decline-hold';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import { useDebounce } from '~/hooks/use-debounce';
import type { TileTone } from '~/modules/common/expandable-tile';
import type { EnrichedChannel } from '~/modules/entities/types';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';

/** What an invite does with an address: asks to be fixed, goes unchecked, sends a first invitation, sends the email again, or leaves it out. */
export type InviteGroupKey = 'fix' | 'unchecked' | 'new' | 'again' | 'out';

/** How an address reads everywhere it shows: chip, list row and summary. */
export interface InviteView {
  group: InviteGroupKey;
  tone: TileTone;
  word: string;
  note: string;
  /** After the address on a chip. */
  chipNote?: string;
  checking?: boolean;
}

const day = (date?: string) => (date ? dayjs.utc(date).local().format('D MMM') : '');

/**
 * The view of a checked address, from what the check or the invite answered for it.
 * @param held - The invite waits for its draft channel's publish, which mails only addresses that had no email yet.
 */
export const outcomeView = (outcome: InviteOutcome | undefined, t: TFunction, held?: boolean): InviteView => {
  if (outcome?.outcome === 'member') {
    const note = lowercaseLabel(t('c:invite_group_out'));
    return { group: 'out', tone: 'muted', word: t('c:already_member'), note, chipNote: lowercaseLabel(t('c:member')) };
  }
  if (outcome?.outcome !== 'remind') {
    return { group: 'new', tone: 'success', word: t('c:invite_state_new'), note: lowercaseLabel(t('c:invite_state_gets_invitation')) };
  }

  const { declinedAt, invitedAt } = outcome;
  if (declinedAt) {
    const word = t('c:invite_state_declined', { date: day(declinedAt) });
    if (declineHolds(declinedAt)) {
      const until = dayjs.utc(declinedAt).add(appConfig.retention.declinedInvitationHoldDays, 'day').toISOString();
      const note = lowercaseLabel(t('c:invite_state_no_email_until', { date: day(until) }));
      return { group: 'out', tone: 'warning', word, note, chipNote: note };
    }
    return { group: 'again', tone: 'warning', word, note: lowercaseLabel(t('c:invite_state_invited_again')), chipNote: lowercaseLabel(word) };
  }

  const word = t('c:invite_state_invited', { date: day(invitedAt) }).trim();
  const note = lowercaseLabel(t(held ? 'c:invite_state_no_email_before_publish' : 'c:invite_state_gets_email_again'));
  return { group: held ? 'out' : 'again', tone: 'info', word, note, chipNote: held ? note : lowercaseLabel(word) };
};

/** The view of text that holds no address: near-misses ask for a fix, anything else in a paste is simply left out. */
export const unparsedView = (text: string, t: TFunction): InviteView => {
  if (!text.includes('@')) {
    return { group: 'out', tone: 'muted', word: t('c:invite_state_no_address'), note: lowercaseLabel(t('c:invite_group_out')) };
  }
  const word = t('c:invite_state_not_address');
  return { group: 'fix', tone: 'destructive', word, note: lowercaseLabel(t('c:invite_state_edit_or_remove')), chipNote: lowercaseLabel(word) };
};

/**
 * What an invite would do with each address, checked a moment after the list stops changing. Without a channel (a
 * system invite) every address is new.
 */
export function useInviteCheck(channel: EnrichedChannel | undefined, emails: string[], unparsed: string[], held: boolean) {
  const { t } = useTranslation();
  const settled = useDebounce(emails, 300);
  const sorted = useMemo(() => [...new Set(settled.map((email) => email.toLowerCase()))].sort(), [settled]);
  const { data, isFetching } = useQuery({ ...inviteCheckQueryOptions(channel, sorted), placeholderData: keepPreviousData });

  const byEmail = useMemo(() => new Map((data ?? []).map((outcome) => [outcome.email, outcome])), [data]);

  const views = new Map<string, InviteView>();
  const groups: Record<InviteGroupKey, string[]> = { fix: [], unchecked: [], new: [], again: [], out: [] };
  const add = (address: string, view: InviteView) => {
    views.set(address, view);
    groups[view.group].push(address);
  };

  for (const text of unparsed) add(text, unparsedView(text, t));
  for (const email of emails) {
    const outcome = byEmail.get(email.toLowerCase());
    if (outcome || !channel) {
      add(email, outcomeView(outcome, t, held));
    } else if (isFetching || settled !== emails) {
      add(email, { group: 'new', tone: 'muted', word: t('c:invite_state_checking'), note: '', checking: true });
    } else {
      // The check failed: the send still goes and answers for this address, so nothing here claims it is new.
      const word = t('c:invite_state_unchecked');
      add(email, { group: 'unchecked', tone: 'warning', word, note: '', chipNote: lowercaseLabel(word) });
    }
  }

  return { groups, viewOf: (address: string) => views.get(address) ?? unparsedView(address, t) };
}

export type InviteCheck = ReturnType<typeof useInviteCheck>;
