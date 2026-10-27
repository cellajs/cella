import { ChevronRightIcon, ClockIcon, UserCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MiddleCut } from '~/modules/common/middle-cut';
import { inviteNote, type useInviteCheck } from '~/modules/user/use-invite-check';

interface InviteGroupsProps {
  emails: string[];
  check: ReturnType<typeof useInviteCheck>;
}

/** The addresses as three groups, for when there are too many to read as chips: new, invited before, already members. */
export function InviteGroups({ emails, check }: InviteGroupsProps) {
  const { t } = useTranslation();

  const invited = emails.filter((email) => check.stateOf(email) === 'invited');
  const members = emails.filter((email) => check.stateOf(email) === 'member');
  const fresh = emails.filter((email) => !invited.includes(email) && !members.includes(email));

  const groups = [
    { key: 'new', label: t('c:invite_group_new', { count: fresh.length }), items: fresh, icon: null, open: false },
    { key: 'invited', label: t('c:invite_group_invited', { count: invited.length }), items: invited, icon: ClockIcon, open: true },
    { key: 'member', label: t('c:invite_group_member', { count: members.length }), items: members, icon: UserCheckIcon, open: true },
  ].filter(({ items }) => items.length);

  if (!groups.length) return null;

  return (
    <div className="divide-y rounded-md border text-sm">
      {groups.map(({ key, label, items, icon: Icon, open }) => (
        <details key={key} open={open} className="group/group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-4 opacity-50 transition-transform group-open/group:rotate-90" />
            {Icon && <Icon className="size-4 opacity-70" />}
            {label}
          </summary>
          <ul className="pr-3 pb-2 pl-9 text-muted-foreground">
            {items.map((email) => (
              <li key={email} className="flex justify-between gap-3 py-1">
                <MiddleCut text={email} className="text-foreground" />
                <span className="shrink-0">{inviteNote(check.outcomeOf(email), t)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
