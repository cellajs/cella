import { Expand, Shrink } from 'lucide-react';
import type React from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/utils';

import './style.css';
import useBodyClass from '~/hooks/use-body-class';

interface FocusViewProps {
  className?: string;
  iconOnly?: boolean;
}

export const FocusView = ({ className = '', iconOnly }: FocusViewProps) => {
  const { t } = useTranslation();
  const { focusView, setFocusView, setNavSheetOpen } = useNavigationStore();

  const toggleFocus = () => {
    showToast(focusView ? t('common:left_focus.text') : t('common:entered_focus.text'), 'success');
    setFocusView(!focusView);
    setNavSheetOpen(null);
    window.scrollTo(0, 0);
  };

  return (
    <TooltipButton toolTipContent={t('common:focus_view')} disabled={!iconOnly}>
      <Button variant={'outline'} className={cn('flex max-lg:hidden', className)} onClick={toggleFocus}>
        {focusView ? <Shrink size={16} /> : <Expand size={16} />}
        {!iconOnly && <span className="ml-1">{focusView ? t('common:leave_focus_view') : t('common:focus_view')}</span>}
      </Button>
    </TooltipButton>
  );
};

export const FocusViewContainer = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { focusView, setFocusView } = useNavigationStore();

  useBodyClass({ 'focus-view': focusView });

  // Reset focus view on unmount
  useEffect(() => {
    return () => {
      setFocusView(false);
    };
  }, []);

  return <div className={cn('focus-view-container', className, focusView ? 'w-full h-full max-w-none min-w-full min-h-full' : '')}>{children}</div>;
};
