import { cloneElement, forwardRef, isValidElement, type ReactElement, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';

interface RequestPasswordDialogProps {
  email?: string;
  onEmailChange?: () => void;
  ref: RefObject<HTMLButtonElement>;
  children: ReactElement<{ onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void }>;
}

export const RequestPasswordDialog = forwardRef<HTMLButtonElement, RequestPasswordDialogProps>(
  ({ email, onEmailChange, children }, ref) => {
    const { t } = useTranslation();
    const createDialog = useDialoger((state) => state.create);

    const openDialog = () => {
      createDialog(<RequestPasswordForm email={email} onEmailChange={onEmailChange} />, {
        id: 'request-password',
        triggerRef: ref as RefObject<HTMLButtonElement>,
        className: 'md:max-w-xl',
        title: t('common:reset_resource', { resource: t('common:password').toLowerCase() }),
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
  },
);

RequestPasswordDialog.displayName = 'RequestPasswordDialog';
