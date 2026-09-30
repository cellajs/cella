import { createContext, useContext } from 'react';
import type { StepItem, StepperProps } from '~/modules/common/stepper/types';

interface StepperContextValue {
  steps: StepItem[];
  activeStep: number;
  onClickStep?: StepperProps['onClickStep'];
  nextStep: () => void;
  setStep: (step: number) => void;
}

/** Outside a stepper the defaults apply, so forms that call `nextStep` also work on their own. */
export const StepperContext = createContext<StepperContextValue>({
  steps: [],
  activeStep: 0,
  nextStep: () => {},
  setStep: () => {},
});

export const useStepper = () => {
  const context = useContext(StepperContext);
  const currentStep = context.steps[context.activeStep];

  return {
    ...context,
    currentStep,
    isOptionalStep: !!currentStep?.optional,
    isLastStep: context.activeStep === context.steps.length - 1,
    hasCompletedAllSteps: context.activeStep === context.steps.length,
  };
};
