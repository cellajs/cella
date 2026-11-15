import { KeyRoundIcon, LogOutIcon, SmartphoneIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isStrategyEnabled } from 'shared';
import { type RecoverableFactor, useRemoveUserFactorMutation, useRevokeUserSessionsMutation } from '~/modules/auth/account/query';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { Button } from '~/modules/ui/button';
import type { BaseUser } from '~/modules/user/types';
import { useCurrentUser, useUserStore } from '~/modules/user/user-store';

function RevokeSessionsConfirm({ userId }: { userId: string }) {
  const overlay = useOverlayClose();
  const { mutate, isPending } = useRevokeUserSessionsMutation(userId);
  return <DeleteForm label="c:sign_out_everywhere" onDelete={() => mutate(undefined, { onSuccess: () => overlay?.close() })} pending={isPending} />;
}

function RemoveFactorConfirm({ userId, factor }: { userId: string; factor: RecoverableFactor }) {
  const overlay = useOverlayClose();
  const { mutate, isPending } = useRemoveUserFactorMutation(userId, factor);
  return (
    <DeleteForm
      label={factor === 'passkey' ? 'c:remove_passkeys' : 'c:remove_totp'}
      onDelete={() => mutate(undefined, { onSuccess: () => overlay?.close() })}
      pending={isPending}
    />
  );
}

/**
 * A system administrator's recovery of another account, under the user's edit sheet: sign the person out everywhere,
 * or remove a lost sign-in method. Each action asks for a confirmation and a step-up, and mails the person.
 */
export function AccountRecovery({ user }: { user: BaseUser }) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!isSystemAdmin || currentUser.id === user.id) return null;

  const open = (id: string, title: string, description: string, content: React.ReactNode) =>
    dialoger.getState().create(content, { id, triggerRef, className: 'md:max-w-xl', title, description });

  const values = { name: user.name };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="account-recovery">
      <h3 id="account-recovery" className="group-label">
        {t('c:account_recovery')}
      </h3>
      <p className="text-muted-foreground text-sm">{t('c:account_recovery.text')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          ref={triggerRef}
          variant="secondary"
          onClick={() =>
            open(
              'revoke-sessions',
              t('c:sign_out_everywhere'),
              t('c:confirm.sign_out_everywhere', values),
              <RevokeSessionsConfirm userId={user.id} />,
            )
          }
        >
          <LogOutIcon />
          {t('c:sign_out_everywhere')}
        </Button>
        {isStrategyEnabled('passkey') && (
          <Button
            variant="secondary"
            onClick={() =>
              open(
                'remove-passkeys',
                t('c:remove_passkeys'),
                t('c:confirm.remove_passkeys', values),
                <RemoveFactorConfirm userId={user.id} factor="passkey" />,
              )
            }
          >
            <KeyRoundIcon />
            {t('c:remove_passkeys')}
          </Button>
        )}
        {isStrategyEnabled('totp') && (
          <Button
            variant="secondary"
            onClick={() =>
              open('remove-totp', t('c:remove_totp'), t('c:confirm.remove_totp', values), <RemoveFactorConfirm userId={user.id} factor="totp" />)
            }
          >
            <SmartphoneIcon />
            {t('c:remove_totp')}
          </Button>
        )}
      </div>
    </section>
  );
}
