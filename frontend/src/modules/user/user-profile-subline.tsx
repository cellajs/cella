import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetUserResponse } from 'sdk';
import { appConfig } from 'shared';

/**
 * The line below a user's name in the profile header: the email address and the MFA setting. The API returns
 * `mfaRequired` only to the user themselves, system admins and admins of an organization the user is in, so the
 * setting shows for them alone.
 */
export function UserProfileSubline({ user }: { user: GetUserResponse }) {
  const { t } = useTranslation();

  return (
    // The header's text column clips, so the link draws its ring inside a padding that a negative margin takes back
    // out of the row. The row's own end padding holds that overhang, or the column would scroll when the link takes focus.
    <div className="flex min-w-0 items-center gap-2 pr-1 text-muted-foreground">
      <a href={`mailto:${user.email}`} className="focus-inset -m-1 truncate rounded-sm p-1 transition-colors hover:text-foreground">
        {user.email}
      </a>
      {user.mfaRequired !== undefined && (
        <>
          <span aria-hidden="true" className="text-muted-foreground/70">
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
