import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserMinimalBase } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
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

/**
 * Render a user cell with avatar and name, wrapped in a link to open user sheet.
 */
export const UserCell = ({
  user,
  tabIndex,
  compactable,
  className,
  readOnly,
}: BaseProps & { user: UserMinimalBase }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cellRef = useRef<HTMLButtonElement | null>(null);

  const setTriggerRef = sheeter.getState().setTriggerRef;

  if (readOnly) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <EntityAvatar type="user" className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
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
      onClick={(e) => {
        if (!onlineManager.isOnline()) {
          e.preventDefault();
          return toaster(t('c:action.offline.text'), 'warning');
        }
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();

        // Store trigger to bring focus back
        setTriggerRef(user.id, cellRef);

        navigate({
          to: '.',
          replace: false,
          resetScroll: false,
          search: (prev) => ({ ...prev, userSheetId: user.id }),
        });
      }}
    >
      <EntityAvatar
        type="user"
        className="h-8 w-8 group-active:translate-y-[.05rem]"
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
      <span
        className={cn(
          'truncate decoration-foreground/20 underline-offset-3 group-hover:underline group-active:translate-y-[.05rem] group-active:decoration-foreground/50',
          { [compactUserNameClass]: compactable },
        )}
      >
        {user.name || '-'}
      </span>
    </Button>
  );
};
