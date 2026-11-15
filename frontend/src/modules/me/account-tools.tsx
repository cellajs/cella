import { useNavigate } from '@tanstack/react-router';
import { TrashIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { NamedText } from '~/modules/common/named-text';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { ToolCard } from '~/modules/common/tool-card';
import { ConnectedAppsList } from '~/modules/me/connected-apps-list';
import { useDeleteSelfMutation } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';

export function AccountGeneralCard() {
  const user = useCurrentUser();

  return (
    <ToolCard label="c:general" unsaved id="update-user">
      <UpdateUserForm user={user} />
    </ToolCard>
  );
}

export function AccountConnectedAppsCard() {
  const { t } = useTranslation();

  return (
    <ToolCard label="c:connected_apps" description={t('c:connected_apps.text')}>
      <ConnectedAppsList />
    </ToolCard>
  );
}

function DeleteSelf() {
  const navigate = useNavigate();
  const overlay = useOverlayClose();

  const { mutate: deleteSelf, isPending } = useDeleteSelfMutation();

  const deleteAndSignOut = () =>
    deleteSelf(undefined, {
      onSuccess: () => {
        navigate({ to: '/auth/sign-out', replace: true, search: { force: true } });
        overlay?.close();
      },
    });

  return <DeleteForm label="c:delete_account" onDelete={deleteAndSignOut} pending={isPending} />;
}

export function AccountDeleteCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const openDeleteDialog = () =>
    dialoger.getState().create(<DeleteSelf />, {
      id: 'delete-account',
      triggerRef: deleteButtonRef,
      className: 'md:max-w-xl',
      title: t('c:delete_account'),
      description: <NamedText i18nKey="c:confirm.delete_account" values={{ email: user.email ?? '' }} />,
    });

  return (
    <ToolCard label="c:delete_account" description={t('c:delete_account.text')}>
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon />
        {t('c:delete_account')}
      </Button>
    </ToolCard>
  );
}
