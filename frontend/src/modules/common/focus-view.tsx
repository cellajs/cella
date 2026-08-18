import { ExpandIcon, ShrinkIcon } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useBodyClass } from '~/hooks/use-body-class';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster/toaster';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
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

/** Toggles focus view mode, which hides non-essential UI. */
export function FocusView({ className = '', iconOnly }: FocusViewProps) {
  const { t } = useTranslation();
  const { focusView, setFocusView } = useUIStore();
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const removeSheet = sheeter.getState().remove;

  const toggleFocus = () => {
    toaster.success(focusView ? t('c:left_focus.text') : t('c:entered_focus.text'));
    setFocusView(!focusView);
    removeSheet();
    setNavSheetOpen(null);
    window.scrollTo(0, 0);
  };

  return (
    <TooltipButton toolTipContent={t('c:focus_view')} disabled={!iconOnly} className="max-lg:hidden">
      <Button variant={'outline'} className={cn('flex max-lg:hidden', className)} onClick={toggleFocus}>
        {focusView ? <ShrinkIcon /> : <ExpandIcon />}
        {!iconOnly && <span className="ml-1">{focusView ? t('c:leave_focus_view') : t('c:focus_view')}</span>}
      </Button>
    </TooltipButton>
  );
}

/** Applies focus view styles while the mode is active. Wraps the page's main content. */
export function FocusViewContainer({ children, className = '', disabled }: FocusViewContainerProps) {
  const focusView = useUIStore((state) => state.focusView);

  const isActive = focusView && !disabled;

  useBodyClass({ 'focus-view': isActive });

  return (
    <div
      className={cn(
        'focus-view-container container flex min-h-svh flex-col gap-2 pt-3',
        className,
        isActive ? 'focused min-h-full w-full min-w-full max-w-none' : '',
      )}
    >
      {children}
    </div>
  );
}
