import type { TFunction } from 'i18next';
import { CircleAlertIcon, CircleCheckIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InviteOutcome } from 'sdk';
import { type ChannelEntityType, hierarchy } from 'shared';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import { ExpandableList } from '~/modules/common/expandable-list';
import { StatusTile, TileListHeading, type TileTone } from '~/modules/common/expandable-tile';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { outcomeView, unparsedView } from '~/modules/user/use-invite-check';

/** What a sent invite did with everything the form held. */
export interface InviteResultData {
  outcomes: InviteOutcome[];
  /** Refused by a system invite: an account holds the address, or it holds an unexpired invitation. */
  rejected: string[];
  /** Left over when a later batch failed. */
  unsent: string[];
  unparsed: string[];
  /** Saved until its draft channel is published. */
  held: boolean;
  /** The role asked for and whose vocabulary it is in; none on a system invite. */
  role?: string;
  entityType?: ChannelEntityType;
}

interface ResultRow {
  id: string;
  tone: TileTone;
  word: string;
  note: string;
}

/** Every address by how it ended. */
const sortResult = ({ outcomes, rejected, unsent, unparsed, held, role, entityType }: InviteResultData, t: TFunction) => {
  const notSent: ResultRow[] = [
    ...unsent.map(
      (id): ResultRow => ({ id, tone: 'destructive', word: t('c:invite_result_not_sent'), note: lowercaseLabel(t('c:invite_state_try_again')) }),
    ),
    ...unparsed.map((id): ResultRow => {
      const { tone, word } = unparsedView(id, t);
      return { id, tone, word, note: lowercaseLabel(t('c:invite_group_out')) };
    }),
    ...rejected.map((id): ResultRow => ({ id, tone: 'muted', word: t('c:invite_state_taken'), note: lowercaseLabel(t('c:invite_group_out')) })),
  ];
  const invited: ResultRow[] = [];
  const reminded: ResultRow[] = [];
  const added: ResultRow[] = [];

  for (const outcome of outcomes) {
    const { email: id } = outcome;
    const { group, tone, word, note } = outcomeView(outcome, t, held);
    if (outcome.outcome === 'invite') {
      const sentNote = t(held ? 'c:invite_state_on_publish' : 'c:invite_state_email_sent');
      invited.push({ id, tone: 'success', word: t('c:invite_group_invited'), note: lowercaseLabel(sentNote) });
    } else if (outcome.outcome === 'add') {
      added.push({ id, tone: 'success', word: t('c:invite_group_added'), note: lowercaseLabel(t('c:invite_state_added')) });
    } else if (group === 'again') {
      reminded.push({ id, tone, word, note });
    } else if (outcome.role && role && entityType && hierarchy.outranks(entityType, role, outcome.role)) {
      // Asked for a higher role than a member holds: an invite never changes a role, so say which one stays.
      notSent.push({ id, tone, word, note: lowercaseLabel(t('c:invite_state_keeps_role', { role: t(`c:${outcome.role}`) })) });
    } else {
      notSent.push({ id, tone, word, note });
    }
  }

  return { notSent, invited, reminded, added };
};

/** A plain send fits a toast; anything the inviter did not see coming gets a row of its own. */
export const inviteResultNeedsScreen = (result: InviteResultData, t: TFunction) => {
  const { notSent, reminded, added } = sortResult(result, t);
  return notSent.length > 0 || added.length > 0 || reminded.some(({ tone }) => tone === 'warning');
};

/** What went out, in a few words. */
export const inviteResultTitle = (result: InviteResultData, t: TFunction) => {
  const { invited, reminded, added } = sortResult(result, t);

  if (result.held && invited.length + reminded.length) return t('c:invite_result_saved', { count: invited.length + reminded.length });
  const parts = [
    invited.length && t('c:invite_result_invited', { count: invited.length }),
    reminded.length && t('c:invite_result_reminded', { count: reminded.length }),
    added.length && t('c:invite_result_added', { count: added.length }),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : t('c:invite_result_none');
};

/** Moves focus when an element mounts: what held focus is gone. A stable reference, so a rerender moves nothing. */
export const focusOnMount = (node: HTMLElement | null) => node?.focus();

interface InviteResultProps {
  result: InviteResultData;
  onDone: () => void;
  /** Without one the screen offers no way to the pending invitations. */
  onOpenPending?: () => void;
  /** Back to an empty form. */
  onInviteMore: () => void;
}

/** What a sent invite did, per address, for when a toast would hide what the inviter needs to know. */
export function InviteResult({ result, onDone, onOpenPending, onInviteMore }: InviteResultProps) {
  const { t } = useTranslation();

  const { notSent, invited, reminded, added } = sortResult(result, t);
  const anySent = invited.length + reminded.length + added.length > 0;
  const Icon = anySent ? CircleCheckIcon : CircleAlertIcon;

  const groups = [
    { key: 'not_sent', title: t('c:invite_result_not_sent'), rows: notSent },
    { key: 'invited', title: t('c:invite_group_invited'), rows: invited },
    { key: 'reminded', title: t('c:invite_group_reminded'), rows: reminded },
    { key: 'added', title: t('c:invite_group_added'), rows: added },
  ].filter(({ rows }) => rows.length);

  return (
    <div className="flex flex-col gap-6">
      <Alert ref={focusOnMount} tabIndex={-1} variant={anySent ? 'success' : 'warning'} className="outline-hidden">
        <Icon />
        <AlertTitle>{inviteResultTitle(result, t)}</AlertTitle>
        {notSent.length > 0 && <AlertDescription>{t('c:invite_result_not_sent_count', { count: notSent.length })}</AlertDescription>}
      </Alert>

      <div className="flex flex-col gap-4">
        {groups.map(({ key, title, rows }) => (
          <section key={key} className="flex flex-col gap-2">
            <TileListHeading title={title} count={rows.length} />
            <ExpandableList
              items={rows}
              initialDisplayCount={3}
              alwaysShowAll={key === 'not_sent'}
              renderItem={({ id, tone, word, note }) => (
                <StatusTile
                  icon={<MailIcon className="text-muted-foreground" />}
                  title={<MiddleCut text={id} />}
                  status={{ tone, label: word }}
                  meta={note}
                />
              )}
            />
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 max-sm:*:first:flex-1">
        <Button onClick={onDone}>{t('c:done')}</Button>
        {onOpenPending && (
          <Button variant="secondary" onClick={onOpenPending}>
            {t('c:pending_invitations')}
          </Button>
        )}
        <Button variant="ghost" onClick={onInviteMore}>
          {t('c:invite_more')}
        </Button>
      </div>
    </div>
  );
}
