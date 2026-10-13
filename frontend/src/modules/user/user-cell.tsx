import { onlineManager } from '@tanstack/react-query';
import { useRef } from 'react';
import type { UserMinimalBase } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';
import { cn } from '~/utils/cn';
import { Button } from '../ui/button';

interface BaseProps {
  tabIndex: number;
  compactable?: boolean;
  className?: string;
  /** When true, render avatar + name without the button/navigate behavior (e.g. in public layouts where the user sheet is not mounted). */
  readOnly?: boolean;
}

// DataGrid sets data-is-compact on its root/merged slots; keep the name accessible while hiding it visually.
const compactUserNameClass = 'in-data-[is-compact=true]:sr-only';

export function UserCell({ user, tabIndex, compactable, className, readOnly }: BaseProps & { user: UserMinimalBase }) {
  const openUserSheet = useOpenUserSheet();
  const cellRef = useRef<HTMLButtonElement | null>(null);

  // While compacted the name is visually hidden, so the compact-scoped table tooltip shows it.
  const compactTooltip = compactable && user.name ? { 'data-tooltip': 'compact', 'data-tooltip-content': user.name } : undefined;

  if (readOnly) {
    return (
      <div className={cn('flex items-center gap-2', className)} {...compactTooltip}>
        <EntityAvatar type="user" className="size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
        <span className={cn('truncate', { [compactUserNameClass]: compactable })}>{user.name || '-'}</span>
      </div>
    );
  }

  return (
    <Button
      ref={cellRef}
      variant="cell"
      size="cell"
      className={className}
      tabIndex={tabIndex}
      draggable={false}
      {...compactTooltip}
      onClick={(e) => {
        // Offline the opener only toasts, so the click must not fall through either.
        if (onlineManager.isOnline() && (e.metaKey || e.ctrlKey)) return;
        e.preventDefault();
        openUserSheet(user.id);
      }}
    >
      <EntityAvatar type="user" className="group-active/cell-button:press size-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
      <span
        className={cn(
          'group-active/cell-button:press link-decoration group-active/cell-button:link-decoration-strong truncate group-hover/cell-button:underline',
          { [compactUserNameClass]: compactable },
        )}
      >
        {user.name || '-'}
      </span>
    </Button>
  );
}
