import type { ReactNode } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';

export interface StepItem {
  id?: string;
  label?: string;
  description?: string;
  optional?: boolean;
}

export interface StepperProps {
  children?: ReactNode;
  className?: string;
  initialStep?: number;
  steps: StepItem[];
  /** @deprecated Has no effect: the stepper is always vertical. */
  orientation?: 'vertical';
  /** Makes the step buttons clickable; the handler decides whether to call `setStep`. */
  onClickStep?: (step: number, setStep: (step: number) => void) => void;
}

export interface StepProps {
  children?: ReactNode;
  label?: ReactNode;
  /** Shown on the step button once the step is completed, in place of a check. */
  checkIcon?: IconComponent;
  /** @deprecated Has no effect: steps have no error state. */
  isKeepError?: boolean;
  /** The step's position, which `Stepper` sets on each child. */
  index?: number;
}
