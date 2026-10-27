import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { appConfig } from 'shared';
import { MiddleCut } from '~/modules/common/middle-cut';

interface UserProfileSublineProps {
  user: GetUserResponse;
}

/** The line below a user's name in the profile header: the email address and, where the API returns it, the MFA setting. */
export function UserProfileSubline({ user }: UserProfileSublineProps) {
  const { t } = useTranslation();

  return (
    // The text column clips: the link's ring sits in a padding its negative margin takes back, and pr-1 keeps the column from scrolling on focus.
    <div className="flex min-w-0 items-center gap-2 pr-1 text-muted-foreground">
      <a href={`mailto:${user.email}`} className="focus-inset -m-1 truncate rounded-sm p-1 transition-colors hover:text-foreground">
        <MiddleCut text={user.email} />
      </a>
      {user.mfaRequired !== undefined && (
        <>
          <span aria-hidden="true" className="text-faint-foreground">
            ·
          </span>
          {/* A phone has room for the icon alone */}
          <span className="flex shrink-0 items-center gap-1">
            {user.mfaRequired ? <ShieldCheckIcon className="size-3.5" /> : <ShieldMinusIcon className="size-3.5" />}
            <span className="max-sm:sr-only">{t(user.mfaRequired ? 'c:mfa_on' : 'c:mfa_off')}</span>
          </span>
        </>
      )}
      {appConfig.mode === 'development' && <span className="ml-2 shrink-0 text-xs max-sm:hidden">{user.id}</span>}
    </div>
  );
}
