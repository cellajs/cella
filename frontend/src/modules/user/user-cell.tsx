import type { UserMinimalBase } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
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
}

// DataGrid sets data-is-compact on its root/merged slots; keep the name accessible while hiding it visually.
const compactUserNameClass = tw('in-data-[is-compact=true]:sr-only');

export function UserCell({ user, tabIndex, compactable, className, readOnly }: UserCellProps) {
  const openUserSheet = useOpenUserSheet();

  // While compacted the name is visually hidden, so the compact-scoped table tooltip shows it.
  const compactTooltip = compactable && user.name ? { 'data-tooltip': 'compact', 'data-tooltip-content': user.name } : undefined;

  if (readOnly) {
    return (
      <div className={cn('flex items-center gap-2', className)} {...compactTooltip}>
        <EntityAvatar type="user" className="size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
        <span className={cn('truncate', compactable && compactUserNameClass)}>{user.name || '-'}</span>
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
      <EntityAvatar type="user" className="group-active/cell-button:press size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
      <span
        className={cn(
          'group-active/cell-button:press link-decoration group-active/cell-button:link-decoration-strong truncate group-hover/cell-button:underline',
          compactable && compactUserNameClass,
        )}
      >
        {user.name || '-'}
      </span>
    </Button>
  );
}
