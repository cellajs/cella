import type { StepSharedProps } from '~/modules/common/stepper/types';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type StepButtonContainerProps = StepSharedProps & {
  children?: React.ReactNode;
};

const StepButtonContainer = ({
  isCurrentStep,
  isCompletedStep,
  children,
  isError,
  index,
  isLoading: isLoadingProp,
  onClickStep,
}: StepButtonContainerProps) => {
  const { clickable, isLoading: isLoadingContext, variant, styles, setStep, onClickStep: onClickStepGeneral } = useStepper();

  const currentStepClickable = clickable || !!onClickStep;

  const isLoading = isLoadingProp || isLoadingContext;

  if (variant === 'line') {
    return null;
  }

  return (
    <Button
      variant="ghost"
      type="button"
      tabIndex={currentStepClickable ? 0 : -1}
      className={cn(
        'stepper__step-button-container',
        'rounded-full p-0 pointer-events-none',
        'w-[var(--step-icon-size)] h-[var(--step-icon-size)]',
        'border-2 flex rounded-full justify-center items-center',
        'data-[clickable=true]:pointer-events-auto',
        'data-[active=true]:bg-primary data-[active=true]:border-primary data-[active=true]:text-primary-foreground',
        'data-[current=true]:border-primary data-[current=true]:bg-secondary',
        'data-[invalid=true]:bg-destructive data-[invalid=true]:border-destructive data-[invalid=true]:text-destructive-foreground',
        styles?.['step-button-container'],
      )}
      aria-current={isCurrentStep ? 'step' : undefined}
      data-current={isCurrentStep}
      data-invalid={isError && (isCurrentStep || isCompletedStep)}
      data-active={isCompletedStep}
      data-clickable={currentStepClickable}
      data-loading={isLoading && (isCurrentStep || isCompletedStep)}
      onClick={() => {
        onClickStep?.(index || 0, setStep) || onClickStepGeneral?.(index || 0, setStep);
      }}
      onKeyDown={() => {}}
    >
      {children}
    </Button>
  );
};

export { StepButtonContainer };
