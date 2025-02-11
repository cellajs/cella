import { type ReactElement, cloneElement, forwardRef, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { dialog } from '~/modules/common/dialoger/state';

interface RequestPasswordDialogProps {
  email?: string;
  children: ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }>;
}

export const RequestPasswordDialog = forwardRef<HTMLButtonElement, RequestPasswordDialogProps>(({ email, children }, _) => {
  const { t } = useTranslation();

  const openDialog = () => {
    dialog(<RequestPasswordForm email={email} />, {
      id: 'request-password',
      className: 'md:max-w-xl',
      title: t('common:reset_password'),
      description: t('common:reset_password.text'),
    });
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    children.props.onClick?.(event);
    openDialog();
  };

  if (!isValidElement(children)) return children;

  return cloneElement(children, { onClick: handleClick });
});

RequestPasswordDialog.displayName = 'RequestPasswordDialog';
