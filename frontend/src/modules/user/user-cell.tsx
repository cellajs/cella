import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase, UserMinimalBase } from '~/api.gen';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/service';
import { useFindInListCache } from '~/query/basic';
import { cn } from '~/utils/cn';
import { Button } from '../ui/button';

interface BaseProps {
  tabIndex: number;
  compactable?: boolean;
  className?: string;
}

/**
 * Render a user cell with avatar and name, wrapped in a link to open user sheet.
 */
export const UserCell = ({ user, tabIndex, compactable, className }: BaseProps & { user: UserMinimalBase }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cellRef = useRef<HTMLButtonElement | null>(null);

  const setTriggerRef = useSheeter.getState().setTriggerRef;

  return (
    <Button
      ref={cellRef}
      variant="cell"
      size="cell"
      className={className}
      tabIndex={tabIndex}
      draggable="false"
      onClick={(e) => {
        if (!onlineManager.isOnline()) {
          e.preventDefault();
          return toaster(t('common:action.offline.text'), 'warning');
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
      <AvatarWrap
        type="user"
        className="h-8 w-8 group-active:translate-y-[.05rem]"
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
      <span
        className={cn(
          'group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate',
          { '[[data-is-compact=true]_*&]:hidden': compactable },
        )}
      >
        {user.name || '-'}
      </span>
    </Button>
  );
};

/**
 * Wrapper around UserCell to get userCell by ID from query cache.
 * Searches in both 'user' and 'member' queries since members contain UserBase data.
 */
export const UserCellById = ({
  userId,
  cacheOnly,
  ...baseProps
}: BaseProps & { userId: string | null; cacheOnly: boolean }) => {
  // Find user from cache (search in both 'user' and 'member' queries)
  const user = useFindInListCache<UserBase>([['user'], ['member']], userId ?? '');

  if (!userId) return <span className="text-muted">-</span>;

  return user ? <UserCell compactable={true} user={user} {...baseProps} /> : <span>{userId}</span>;
};
