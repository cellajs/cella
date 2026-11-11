import type { TFunction } from 'i18next';
import type { InviteOutcome } from 'sdk';
import { outcomeView } from '~/modules/user/use-invite-check';
import { formatList } from '~/utils/format-list';

/** What a send answered: the outcomes of what went out, and what did not. */
export interface InviteResultData {
  outcomes: InviteOutcome[];
  /** Refused by a system invite: an account holds the address, or it holds an unexpired invitation. */
  rejected: string[];
  /** Left over when a later batch failed. */
  unsent: string[];
  /** Saved until its draft channel is published. */
  held: boolean;
}

// Up to this many left-out addresses are named; more are counted
const namedLeftOut = 3;

/** What a send did, as a title and the sentences under it. An address the list showed as left out at the send (`shownOut`) is not named again. */
export const describeInviteResult = ({ outcomes, rejected, held }: InviteResultData, shownOut: string[], t: TFunction, channelName?: string) => {
  let invited = 0;
  let reminded = 0;
  let added = 0;
  const leftOut = [...rejected];

  for (const outcome of outcomes) {
    if (outcome.outcome === 'invite') invited++;
    else if (outcome.outcome === 'add') added++;
    else if (outcomeView(outcome, t, held).group === 'again') reminded++;
    else if (!shownOut.includes(outcome.email.toLowerCase())) leftOut.push(outcome.email);
  }

  const parts = [
    invited && t('c:invite_result_invited', { count: invited }),
    reminded && t('c:invite_result_reminded', { count: reminded }),
    added && t('c:invite_result_added', { count: added }),
  ].filter(Boolean);
  const saved = invited + reminded;
  const title = held && saved ? t('c:invite_result_saved', { count: saved }) : parts.join(', ') || t('c:invite_result_none');

  const notes: string[] = [];
  if (leftOut.length > namedLeftOut) notes.push(t('c:invite_result_left_out', { count: leftOut.length }));
  else if (leftOut.length) notes.push(t('c:invite_result_left_out_named', { addresses: formatList(leftOut) }));
  if (held && channelName) notes.push(t('c:invite_result_held', { name: channelName }));

  return { title, notes, anySent: invited + reminded + added > 0 };
};
