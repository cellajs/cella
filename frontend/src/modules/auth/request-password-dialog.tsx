import { type ReactElement, cloneElement, forwardRef, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { dialog } from '~/modules/common/dialoger/state';

interface RequestPasswordDialogProps {
  email?: string;
  children: ReactElement;
}

export const RequestPasswordDialog = forwardRef<HTMLButtonElement, RequestPasswordDialogProps>(({ email, children }) => {
  const { t } = useTranslation();

  const openDialog = () => {
    dialog(<RequestPasswordForm email={email} />, {
      id: 'request-password',
      className: 'md:max-w-xl',
      title: t('common:reset_password'),
      description: t('common:reset_password.text'),
    });
  };

  if (!isValidElement(children)) return children;

  // TODO can we clean this up?
  return cloneElement(children as ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }>, {
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      (children as ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }>).props.onClick?.(event);
      openDialog();
    },
  });
});

RequestPasswordDialog.displayName = 'RequestPasswordDialog';
