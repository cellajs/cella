import { onlineManager } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '../common/avatar-wrap';
import { toaster } from '../common/toaster';
import type { Member } from '../memberships/types';
import type { User } from './types';

/**
 * Render a user cell with avatar and name, wrapped in a link to open user sheet.
 */
const UserCell = ({ user, context, orgIdOrSlug, tabIndex }: { user: User | Member; context: string; orgIdOrSlug?: string; tabIndex: number }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Link
      id={`${context}-${user.id}`}
      to={orgIdOrSlug ? '/$orgIdOrSlug/users/$idOrSlug' : '/users/$idOrSlug'}
      tabIndex={tabIndex}
      params={{ idOrSlug: user.slug, ...(orgIdOrSlug ? { orgIdOrSlug } : {}) }}
      className="flex space-x-2 items-center outline-0 ring-0 group"
      onClick={(e) => {
        if (!onlineManager.isOnline()) {
          e.preventDefault();
          return toaster(t('common:action.offline.text'), 'warning');
        }
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => ({ ...prev, userSheetId: user.id, sheetContext: context }),
        });
      }}
    >
      <AvatarWrap type="user" className="h-8 w-8" id={user.id} name={user.name} url={user.thumbnailUrl} />
      <span className="[.high-density_&]:hidden group-hover:underline underline-offset-4 truncate font-medium">{user.name || '-'}</span>
    </Link>
  );
};

export default UserCell;
