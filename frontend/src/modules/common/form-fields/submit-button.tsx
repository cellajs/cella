import { t } from 'i18next';
import { LoaderCircleIcon, TriangleAlertIcon } from 'lucide-react';
import type * as React from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button, type ButtonProps } from '~/modules/ui/button';

type SubmitButtonProps = Omit<ButtonProps, 'type'> & { allowOfflineDelete?: boolean; icon?: React.ReactNode };

/** Form submit button that warns when offline; `icon` swaps to a spinner on loading, otherwise the spinner overlays the button. */
export function SubmitButton({ onClick, children, allowOfflineDelete = false, loading, disabled, icon, className, ...props }: SubmitButtonProps) {
  const isOnline = useOnlineManager();

  const isDisabled = disabled || loading;
  const showOfflineWarning = !allowOfflineDelete && !isOnline;

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    if (showOfflineWarning) {
      e.preventDefault();
      return toaster.warning(t('c:action.offline.text'));
    }
    onClick?.(e);
  };

  const resolvedIcon = loading ? <LoaderCircleIcon className="animate-spin" /> : showOfflineWarning ? <TriangleAlertIcon /> : icon;

  const buttonContent = (
    <Button
      type="submit"
      onClick={handleClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      loading={!icon && loading}
      className={className}
      {...props}
    >
      {icon ? (
        <>
          {resolvedIcon}
          {children}
        </>
      ) : (
        <>
          {showOfflineWarning && <TriangleAlertIcon />}
          {children}
        </>
      )}
    </Button>
  );

  return showOfflineWarning ? <TooltipButton toolTipContent={t('c:offline.text_with_info')}>{buttonContent}</TooltipButton> : buttonContent;
}
