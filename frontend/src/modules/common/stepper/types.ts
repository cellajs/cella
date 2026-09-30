import type { IconComponent } from '~/modules/common/icons/types';

type StepItem = {
  id?: string;
  label?: string;
  description?: string;
  optional?: boolean;
};

interface StepperProps {
  children?: React.ReactNode;
  className?: string;
  initialStep: number;
  steps: StepItem[];
  orientation?: 'vertical';
  /** Makes the step buttons clickable; the handler decides whether to call `setStep`. */
  onClickStep?: (step: number, setStep: (step: number) => void) => void;
}

interface StepProps {
  children?: React.ReactNode;
  label?: React.ReactNode;
  /** Shown on the step button once the step is completed, in place of a check. */
  checkIcon?: IconComponent;
  /** @deprecated Has no effect: steps have no error state. */
  isKeepError?: boolean;
}

export type { StepItem, StepProps, StepperProps };
