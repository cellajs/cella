import type { UserMinimalBase } from 'sdk';
import { cellLinkTextClass } from '~/modules/common/data-table/columns';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { HighlightText, MatchReason } from '~/modules/common/match-highlight/highlight-text';
import { Button } from '~/modules/ui/button';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

interface UserCellProps {
  user: UserMinimalBase;
  tabIndex: number;
  compactable?: boolean;
  className?: string;
  /** Avatar and name without the sheet link, for layouts that mount no user sheet (public pages). */
  readOnly?: boolean;
  /** Searched with the name: below `md`, where the email column is left out, a match in it shows under the name. */
  email?: string | null;
}

// DataGrid sets data-is-compact on its root/merged slots; keep the name accessible while hiding it visually.
const compactUserNameClass = tw('in-data-[is-compact=true]:sr-only');

export function UserCell({ user, tabIndex, compactable, className, readOnly, email }: UserCellProps) {
  const openUserSheet = useOpenUserSheet();

  // While compacted the name is visually hidden, so the compact-scoped table tooltip shows it.
  const compactTooltip = compactable && user.name ? { 'data-tooltip': 'compact', 'data-tooltip-content': user.name } : undefined;

  if (readOnly) {
    return (
      <div className={cn('flex items-center gap-2', className)} {...compactTooltip}>
        <EntityAvatar type="user" className="size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
        <span className={cn('min-w-0 text-start', compactable && compactUserNameClass)}>
          <span className="block truncate">
            <HighlightText text={user.name || '-'} />
          </span>
          <MatchReason text={email} shownText={user.name} />
        </span>
      </div>
    );
  }

  return (
    <Button
      variant="cell"
      size="cell"
      className={className}
      tabIndex={tabIndex}
      draggable={false}
      {...compactTooltip}
      onClick={() => openUserSheet(user.id)}
    >
      <EntityAvatar type="user" className="size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
      <span className={cn('min-w-0 text-start', compactable && compactUserNameClass)}>
        <span className={cn(cellLinkTextClass, 'block')}>
          <HighlightText text={user.name || '-'} />
        </span>
        <MatchReason text={email} shownText={user.name} />
      </span>
    </Button>
  );
}
