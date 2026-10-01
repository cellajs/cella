import { CheckIcon } from 'lucide-react';
import { Children, cloneElement, isValidElement, useState } from 'react';
import type { StepProps, StepperProps } from '~/modules/common/stepper/types';
import { StepperContext, useStepper } from '~/modules/common/stepper/use-stepper';
import { Button } from '~/modules/ui/button';
import { Collapsible, CollapsibleContent } from '~/modules/ui/collapsible';
import { cn } from '~/utils/cn';

/** Vertical stepper: every step shows a numbered button and its label, only the current step's content is open. */
export function Stepper({ children, className, initialStep = 0, steps, onClickStep }: StepperProps) {
  const [activeStep, setActiveStep] = useState(initialStep);

  // Step reads its position from the index handed down here.
  const items = Children.toArray(children).map((child, index) =>
    isValidElement<{ index?: number }>(child) ? cloneElement(child, { index }) : child,
  );

  return (
    <StepperContext.Provider value={{ steps, activeStep, onClickStep, nextStep: () => setActiveStep((prev) => prev + 1), setStep: setActiveStep }}>
      <div
        className={cn(
          'flex w-full flex-col flex-wrap [--step-gap:0.5rem] [--step-icon-size:2rem]',
          items.length === 1 ? 'justify-end' : 'justify-between',
          className,
        )}
      >
        {items}
      </div>
    </StepperContext.Provider>
  );
}

export function Step({ children, label, checkIcon: Check = CheckIcon, index = 0 }: StepProps & { index?: number }) {
  const { steps, activeStep, isLastStep: isOnLastStep, onClickStep, setStep } = useStepper();

  const isCompletedStep = index < activeStep;
  const isCurrentStep = index === activeStep;
  const clickable = !!onClickStep;

  return (
    <div
      className={cn(
        'relative flex flex-col transition-all duration-200 data-[completed=true]:not-last:after:bg-primary',
        'not-last:gap-(--step-gap) not-last:pb-(--step-gap)',
        "not-last:after:w-0.5 not-last:after:bg-border not-last:after:content-['']",
        'not-last:after:absolute not-last:after:inset-x-[calc(var(--step-icon-size)/2)]',
        'not-last:after:top-[calc(var(--step-icon-size)+var(--step-gap))] not-last:after:bottom-(--step-gap)',
        'not-last:after:transition-all not-last:after:duration-200',
        isOnLastStep && 'gap-(--step-gap)',
      )}
      data-completed={isCompletedStep}
    >
      {steps.length > 1 && (
        <div className="flex items-center">
          <Button
            variant="ghost"
            type="button"
            tabIndex={clickable ? 0 : -1}
            className={cn(
              'pointer-events-none rounded-full p-0',
              'h-(--step-icon-size) w-(--step-icon-size)',
              'flex items-center justify-center rounded-full border-2',
              'data-[clickable=true]:pointer-events-auto',
              'data-[active=true]:border-primary data-[active=true]:bg-primary data-[active=true]:text-primary-foreground',
              'data-[current=true]:border-primary data-[current=true]:bg-secondary',
            )}
            aria-current={isCurrentStep ? 'step' : undefined}
            data-current={isCurrentStep}
            data-active={isCompletedStep}
            data-clickable={clickable}
            onClick={() => onClickStep?.(index, setStep)}
          >
            {isCompletedStep ? <Check className="size-4" /> : <span className="text-center font-medium text-md">{index + 1}</span>}
          </Button>
          {!!label && (
            <div
              aria-current={isCurrentStep ? 'step' : undefined}
              className="ms-2 flex flex-col"
              style={{ opacity: isCurrentStep || isCompletedStep ? 1 : 0.8 }}
            >
              <span className="text-sm">{label}</span>
            </div>
          )}
        </div>
      )}
      <div className={cn(index !== steps.length - 1 && 'min-h-4', 'max-sm:relative max-sm:z-1 sm:ps-(--step-icon-size)')}>
        <Collapsible open={isCurrentStep}>
          <CollapsibleContent className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down">
            {children}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export { useStepper };
