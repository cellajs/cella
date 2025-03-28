import { type ReactElement, type RefObject, cloneElement, forwardRef, isValidElement } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface RequestPasswordDialogProps {
  email?: string;
  ref: RefObject<HTMLButtonElement>;
  children: ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }>;
}

export const RequestPasswordDialog = forwardRef<HTMLButtonElement, RequestPasswordDialogProps>(({ email, children }, ref) => {
  const { t } = useTranslation();
  const createDialog = useDialoger((state) => state.create);

  const openDialog = () => {
    createDialog(<RequestPasswordForm email={email} />, {
      id: 'request-password',
      // TODO
      triggerRef: ref as RefObject<HTMLButtonElement>,
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
