import { ExpandIcon, ShrinkIcon } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

interface FocusViewProps {
  className?: string;
  iconOnly?: boolean;
}

interface FocusViewContainerProps {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

/** Button to toggle focus view mode, which hides non-essential UI elements for a more immersive experience. */
export const FocusView = ({ className = '', iconOnly }: FocusViewProps) => {
  const { t } = useTranslation();
  const { focusView, setFocusView } = useUIStore();
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const removeSheet = sheeter.getState().remove;

  const toggleFocus = () => {
    toaster(focusView ? t('common:left_focus.text') : t('common:entered_focus.text'), 'success');
    setFocusView(!focusView);
    removeSheet();
    setNavSheetOpen(null);
    window.scrollTo(0, 0);
  };

  return (
    <TooltipButton toolTipContent={t('common:focus_view')} disabled={!iconOnly} className="max-lg:hidden">
      <Button variant={'outline'} className={cn('flex max-lg:hidden', className)} onClick={toggleFocus}>
        {focusView ? <ShrinkIcon size={16} /> : <ExpandIcon size={16} />}
        {!iconOnly && <span className="ml-1">{focusView ? t('common:leave_focus_view') : t('common:focus_view')}</span>}
      </Button>
    </TooltipButton>
  );
};

/** Container that applies focus view styles when focus view mode is active. Should wrap the main content of the page. */
export const FocusViewContainer = ({ children, className = '', disabled }: FocusViewContainerProps) => {
  const focusView = useUIStore((state) => state.focusView);

  const isActive = focusView && !disabled;

  useBodyClass({ 'focus-view': isActive });

  return (
    <div
      className={cn(
        'focus-view-container container min-h-screen flex flex-col pt-3 gap-2',
        className,
        isActive ? 'focused w-full max-w-none min-w-full min-h-full' : '',
      )}
    >
      {children}
    </div>
  );
};
