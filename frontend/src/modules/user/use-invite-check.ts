import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { InviteOutcome } from 'sdk';
import { appConfig } from 'shared';
import { declineHolds } from 'shared/decline-hold';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import { useDebounce } from '~/hooks/use-debounce';
import type { TileTone } from '~/modules/common/expandable-tile';
import type { EnrichedChannel } from '~/modules/entities/types';
import { inviteCheckQueryOptions } from '~/modules/memberships/query';
import type { InvitePerson } from '~/modules/user/use-invite-list';

/** What an invite does with an address: asks to be fixed, goes unchecked, sends a first invitation, sends the email again, or leaves it out. */
export type InviteGroupKey = 'fix' | 'unchecked' | 'new' | 'again' | 'out';

/** How an address reads everywhere it shows: the line under a field, its tile and its chip. */
export interface InviteView {
  group: InviteGroupKey;
  tone: TileTone;
  word: string;
  note: string;
  /** Beside the address on its chip, where its tile says too little: a date or a reason. */
  fact?: string;
  checking?: boolean;
}

const day = (date?: string) => (date ? dayjs.utc(date).local().format('D MMM') : '');

/** The view of a checked address from what the check or the invite answered; `held` mails only addresses with no email yet, on publish. */
export const outcomeView = (outcome: InviteOutcome | undefined, t: TFunction, held?: boolean): InviteView => {
  if (outcome?.outcome === 'member') {
    const word = t('c:already_member');
    return { group: 'out', tone: 'muted', word, note: lowercaseLabel(t('c:invite_group_out')), fact: lowercaseLabel(word) };
  }
  if (outcome?.outcome !== 'remind') {
    const note = lowercaseLabel(t(held ? 'c:invite_state_on_publish' : 'c:invite_state_gets_invitation'));
    return { group: 'new', tone: 'success', word: t('c:invite_state_new'), note };
  }

  const { declinedAt, invitedAt } = outcome;
  if (declinedAt) {
    const word = t('c:invite_state_declined', { date: day(declinedAt) });
    if (declineHolds(declinedAt)) {
      const until = dayjs.utc(declinedAt).add(appConfig.retention.declinedInvitationHoldDays, 'day').toISOString();
      const note = lowercaseLabel(t('c:invite_state_no_email_until', { date: day(until) }));
      return { group: 'out', tone: 'warning', word, note, fact: note };
    }
    return { group: 'again', tone: 'warning', word, note: lowercaseLabel(t('c:invite_state_invited_again')), fact: lowercaseLabel(word) };
  }

  const word = t('c:invite_state_invited', { date: day(invitedAt) }).trim();
  const note = lowercaseLabel(t(held ? 'c:invite_state_no_email_before_publish' : 'c:invite_state_gets_email_again'));
  return { group: held ? 'out' : 'again', tone: 'info', word, note, fact: held ? note : lowercaseLabel(word) };
};

/** The view of text that holds no address: near-misses ask for a fix, anything else in a paste is simply left out. */
export const unparsedView = (text: string, t: TFunction): InviteView => {
  if (!text.includes('@')) {
    const word = t('c:invite_state_no_address');
    return { group: 'out', tone: 'muted', word, note: lowercaseLabel(t('c:invite_group_out')), fact: lowercaseLabel(word) };
  }
  return { group: 'fix', tone: 'destructive', word: t('c:invite_state_not_address'), note: lowercaseLabel(t('c:invite_state_edit_or_remove')) };
};

/**
 * What an invite would do with each address, checked a moment after the list stops changing. Without a channel (a
 * system invite) every address is new. A person picked by name is placed by their search's answer until then.
 */
export function useInviteCheck(
  channel: EnrichedChannel | undefined,
  emails: string[],
  unparsed: string[],
  held: boolean,
  people: Map<string, InvitePerson>,
) {
  const { t } = useTranslation();
  const settled = useDebounce(emails, 300);
  const sorted = [...new Set(settled.map((email) => email.toLowerCase()))].sort();
  const { data, isFetching } = useQuery({ ...inviteCheckQueryOptions(channel, sorted), placeholderData: keepPreviousData });

  const byEmail = new Map((data ?? []).map((outcome) => [outcome.email, outcome]));

  const views = new Map<string, InviteView>();
  const groups: Record<InviteGroupKey, string[]> = { fix: [], unchecked: [], new: [], again: [], out: [] };
  const add = (address: string, view: InviteView) => {
    views.set(address, view);
    groups[view.group].push(address);
  };

  for (const text of unparsed) add(text, unparsedView(text, t));
  for (const email of emails) {
    const outcome = byEmail.get(email.toLowerCase()) ?? people.get(email.toLowerCase())?.outcome;
    if (outcome || !channel) {
      add(email, outcomeView(outcome, t, held));
    } else if (isFetching || settled !== emails) {
      add(email, { group: 'new', tone: 'muted', word: t('c:invite_state_checking'), note: '', checking: true });
    } else {
      // The check failed: the send still goes and answers for this address, so nothing here claims it is new.
      add(email, { group: 'unchecked', tone: 'warning', word: t('c:invite_state_unchecked'), note: '' });
    }
  }

  return { groups, viewOf: (address: string) => views.get(address) ?? unparsedView(address, t) };
}

export type InviteCheck = ReturnType<typeof useInviteCheck>;
