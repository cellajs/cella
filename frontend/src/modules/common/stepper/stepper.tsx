import { CheckIcon } from 'lucide-react';
import { Children, cloneElement, isValidElement, useState } from 'react';
import type { StepProps, StepperProps } from '~/modules/common/stepper/types';
import { StepperContext, useStepper } from '~/modules/common/stepper/use-stepper';
import { Button } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

/** Vertical stepper: every step shows a numbered button and its label, only the current step's content is open. */
export function Stepper({ children, className, initialStep = 0, steps, onClickStep, onComplete }: StepperProps) {
  const [activeStep, setActiveStep] = useState(initialStep);

  const nextStep = () => {
    setActiveStep(activeStep + 1);
    if (activeStep === steps.length - 1) onComplete?.();
  };

  const items = Children.toArray(children).map((child, index) => (isValidElement<StepProps>(child) ? cloneElement(child, { index }) : child));

  return (
    <StepperContext.Provider
      value={{
        steps,
        activeStep,
        onClickStep,
        nextStep,
        setStep: setActiveStep,
      }}
    >
      <div className={cn('flex w-full flex-col [--step-gap:0.5rem] [--step-icon-size:2rem]', className)}>{items}</div>
    </StepperContext.Provider>
  );
}

export function Step({ children, label, checkIcon: Check = CheckIcon, index = 0 }: StepProps) {
  const { steps, activeStep, onClickStep, setStep } = useStepper();

  const isCompletedStep = index < activeStep;
  const isCurrentStep = index === activeStep;
  const isClickable = !!onClickStep;

  return (
    <div
      className={cn(
        'group/step relative flex flex-col not-last:gap-(--step-gap) not-last:pb-(--step-gap)',
        // The connector from this step's icon down to the next step's icon
        "not-last:after:absolute not-last:after:inset-x-[calc(var(--step-icon-size)/2)] not-last:after:top-[calc(var(--step-icon-size)+var(--step-gap))] not-last:after:bottom-(--step-gap) not-last:after:w-0.5 not-last:after:bg-border not-last:after:transition-colors not-last:after:duration-200 not-last:after:content-[''] data-[completed=true]:not-last:after:bg-primary",
        isCurrentStep && 'gap-(--step-gap)',
      )}
      data-completed={isCompletedStep}
    >
      {steps.length > 1 && (
        <div className="flex items-center">
          <Button
            variant="ghost"
            type="button"
            tabIndex={isClickable ? 0 : -1}
            className="pointer-events-none size-(--step-icon-size) rounded-full border-2 p-0 data-[clickable=true]:pointer-events-auto data-[completed=true]:border-primary data-[current=true]:border-primary data-[completed=true]:bg-primary data-[current=true]:bg-secondary data-[completed=true]:text-primary-foreground"
            aria-current={isCurrentStep ? 'step' : undefined}
            data-current={isCurrentStep}
            data-completed={isCompletedStep}
            data-clickable={isClickable}
            onClick={() => onClickStep?.(index, setStep)}
          >
            {isCompletedStep ? <Check className="size-4" /> : <span className="text-md">{index + 1}</span>}
          </Button>
          {!!label && <div className={cn('ms-2 text-sm', index > activeStep && 'opacity-80')}>{label}</div>}
        </div>
      )}
      <div className="group-not-last/step:min-h-4 max-sm:relative max-sm:z-1 sm:ps-(--step-icon-size)">
        <Collapsible open={isCurrentStep}>
          <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
            {children}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
