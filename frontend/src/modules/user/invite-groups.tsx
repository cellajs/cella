import { MailIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { ExpandableList } from '~/modules/common/expandable-list';
import { StatusDot, StatusTile, TileListHeading, type TileTone } from '~/modules/common/expandable-tile';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import type { InviteCheck, InviteGroupKey } from '~/modules/user/use-invite-check';

/** In the order they show: what needs a look comes first. */
const inviteGroups: { key: InviteGroupKey; title: TKey; summary: TKey; tone: TileTone }[] = [
  { key: 'fix', title: 'c:invite_group_fix', summary: 'c:invite_summary_fix', tone: 'destructive' },
  { key: 'unchecked', title: 'c:invite_state_unchecked', summary: 'c:invite_summary_unchecked', tone: 'warning' },
  { key: 'new', title: 'c:invite_group_new', summary: 'c:invite_summary_new', tone: 'success' },
  { key: 'again', title: 'c:invite_group_again', summary: 'c:invite_summary_again', tone: 'info' },
  { key: 'out', title: 'c:invite_group_out', summary: 'c:invite_summary_out', tone: 'muted' },
];

interface InviteSummaryProps {
  /** Until the field holds something. */
  hint: string;
  check: InviteCheck;
}

/** One line under a field: how many addresses fall in each group, so nothing goes unmentioned. Stays mounted, so a change is announced. */
export function InviteSummary({ hint, check }: InviteSummaryProps) {
  const { t } = useTranslation();
  const counted = inviteGroups.filter(({ key }) => check.groups[key].length);

  return (
    <div role="status" className="flex flex-wrap gap-x-3.5 gap-y-1 text-muted-foreground text-sm">
      {counted.length
        ? counted.map(({ key, summary, tone }) => (
            <span key={key} className="flex items-center gap-1.5">
              <StatusDot tone={tone} />
              {t(summary, { count: check.groups[key].length })}
            </span>
          ))
        : hint}
    </div>
  );
}

interface EditableAddressProps {
  value: string;
  onFix: (text: string) => void;
}

/** A near-miss, corrected in place: Enter or leaving the field reads it again. */
function EditableAddress({ value, onFix }: EditableAddressProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);

  return (
    <Input
      aria-label={t('c:invite_fix_address', { address: value })}
      value={text}
      inputMode="email"
      autoCapitalize="none"
      spellCheck={false}
      className="focus-inset h-7 px-1.5"
      onChange={({ target }) => setText(target.value)}
      onBlur={() => onFix(text)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onFix(text);
      }}
    />
  );
}

interface InviteGroupsProps {
  check: InviteCheck;
  onRemove: (address: string) => void;
  /** Replaces a near-miss with the corrected text. */
  onFix: (address: string, text: string) => void;
}

/** The addresses as a list by what an invite does with them, for when there are too many to read as chips. */
export function InviteGroups({ check, onRemove, onFix }: InviteGroupsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {inviteGroups.map(({ key, title }) => {
        const items = check.groups[key].map((address) => ({ id: address }));
        if (!items.length) return null;

        return (
          <section key={key} className="flex flex-col gap-2">
            <TileListHeading title={t(title)} count={items.length} />
            <ExpandableList
              items={items}
              initialDisplayCount={5}
              alwaysShowAll={key === 'fix'}
              renderItem={({ id }) => {
                const { tone, word, note } = check.viewOf(id);
                return (
                  <StatusTile
                    icon={<MailIcon className="text-muted-foreground" />}
                    title={key === 'fix' ? <EditableAddress value={id} onFix={(text) => onFix(id, text)} /> : <MiddleCut text={id} />}
                    status={{ tone, label: word }}
                    meta={note}
                    end={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('c:remove_resource', { resource: id })}
                        onClick={() => onRemove(id)}
                        className="shrink-0"
                      >
                        <XIcon />
                      </Button>
                    }
                  />
                );
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
