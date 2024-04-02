import type { TFunction } from 'i18next';
import { Expand, Shrink } from 'lucide-react';
import React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useRouteChange } from '~/hooks/use-route-change';
import { cn } from '~/lib/utils';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

interface FocusViewProps {
  className?: string;
  iconOnly?: boolean;
}

export const FocusView = ({ className = '', iconOnly }: FocusViewProps) => {
  const { t } = useTranslation();
  const { focusView, setFocusView } = useNavigationStore();

  const toggleFocus = () => {
    toast.success(focusView ? t('common:left_focus.text') : t('common:entered_focus.text'));
    setFocusView(!focusView);
  };

  // Render tooltip button if iconOnly is true
  return (
    <>
      {iconOnly ? (
        <TooltipButton toolTipContent="Focus view">
          <FocusViewButton focusView={focusView} iconOnly={iconOnly} toggleFocus={toggleFocus} t={t} className={className} />
        </TooltipButton>
      ) : (
        <FocusViewButton focusView={focusView} iconOnly={iconOnly} toggleFocus={toggleFocus} t={t} className={className} />
      )}
    </>
  );
};

interface FocusViewButtonProps extends FocusViewProps {
  focusView: boolean;
  toggleFocus: () => void;
  t: TFunction<'translation', undefined>;
}

const FocusViewButton = React.forwardRef<HTMLButtonElement, FocusViewButtonProps>(({ focusView, iconOnly, toggleFocus, t, className }, ref) => {
  return (
    <Button ref={ref} variant={'outline'} className={cn('flex max-lg:hidden', className)} onClick={toggleFocus}>
      {focusView ? <Shrink size={16} /> : <Expand size={16} />}
      {!iconOnly && <span className="ml-1">{focusView ? t('common:leave_focus_view') : t('common:focus_view')}</span>}
    </Button>
  );
});

export const FocusViewContainer = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { focusView, setFocusView } = useNavigationStore();
  const [viewClassNames, setViewClassNames] = useState<string>('');
  const { toLocation } = useRouteChange();

  useEffect(() => {
    // (Un)set focus-view on body
    const body = document.body.classList;
    focusView ? body.add('focus-view') : body.remove('focus-view');

    // (Un)set class name on focus view contaier
    const classes = focusView ? 'w-full max-w-none h-full max-w-none min-w-full min-h-full' : '';
    setViewClassNames(classes);

    return () => {
      body.remove('focus-view');
    };
  }, [focusView]);

  // Set focusView to false when toLocation changes or component unmounts
  useEffect(() => {
    if (toLocation) setFocusView(false);
    return () => {
      setFocusView(false);
    };
  }, [toLocation]);

  return <div className={cn('focus-view-container', className, viewClassNames)}>{children}</div>;
};
