import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import type { MouseEventHandler, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button, type ButtonProps } from '~/modules/ui/button';

interface SubmitButtonProps extends Omit<ButtonProps, 'type'> {
  allowOfflineDelete?: boolean;
  icon?: ReactNode;
}

/** Form submit button that warns when offline; `icon` swaps to a spinner on loading, otherwise the spinner overlays the button. */
export function SubmitButton({ onClick, children, allowOfflineDelete = false, loading, disabled, icon, ...props }: SubmitButtonProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const showOfflineWarning = !allowOfflineDelete && !isOnline;

  const handleClick: MouseEventHandler<HTMLButtonElement> = (event) => {
    if (showOfflineWarning) {
      event.preventDefault();
      return toastOffline();
    }
    onClick?.(event);
  };

  const leadingIcon = icon && loading ? <LoaderCircleIcon className="animate-spin" /> : showOfflineWarning ? <TriangleAlertIcon /> : icon;

  const buttonContent = (
    <Button type="submit" onClick={handleClick} disabled={disabled || loading} aria-busy={loading || undefined} loading={!icon && loading} {...props}>
      {leadingIcon}
      {children}
    </Button>
  );

  return showOfflineWarning ? <TooltipButton toolTipContent={t('c:offline.text_with_info')}>{buttonContent}</TooltipButton> : buttonContent;
}
