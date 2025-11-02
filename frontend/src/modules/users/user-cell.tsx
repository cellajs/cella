import { onlineManager } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserBase } from '~/api.gen';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/service';
import { useGetEntityBaseData } from '~/modules/entities/use-get-entity-base-data';

type BaseProps = {
  orgIdOrSlug?: string;
  tabIndex: number;
};

/**
 * Render a user cell with avatar and name, wrapped in a link to open user sheet.
 */
export const UserCell = ({ user, orgIdOrSlug, tabIndex }: BaseProps & { user: UserBase }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cellRef = useRef<HTMLAnchorElement | null>(null);

  const setTriggerRef = useSheeter((state) => state.setTriggerRef);

  return (
    <Link
      ref={cellRef}
      to={orgIdOrSlug ? '/$orgIdOrSlug/user/$idOrSlug' : '/user/$idOrSlug'}
      tabIndex={tabIndex}
      params={{ idOrSlug: user.slug, ...(orgIdOrSlug ? { orgIdOrSlug } : {}) }}
      className="flex space-x-2 items-center outline-0 ring-0 group truncate py-0.5"
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
      <AvatarWrap type="user" className="h-8 w-8 group-active:translate-y-[.05rem]" id={user.id} name={user.name} url={user.thumbnailUrl} />
      <span className="[.isCompact_&]:hidden group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
        {user.name || '-'}
      </span>
    </Link>
  );
};

/**
 * Wrapper around UserCell to get userCell by ID. Avoid trigger `Rendered more hooks than during the previous render.`
 */
export const UserCellById = ({ userId, cacheOnly, ...baseProps }: BaseProps & { userId: string | null; cacheOnly: boolean }) => {
  if (!userId) return <span className="text-muted">-</span>;

  const user = useGetEntityBaseData({ idOrSlug: userId, entityType: 'user', cacheOnly });

  return user ? <UserCell user={user} {...baseProps} /> : <span>{userId}</span>;
};
