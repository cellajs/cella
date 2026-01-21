import { cva } from 'class-variance-authority';
import { CheckIcon, Loader2Icon, XIcon } from 'lucide-react';
import * as React from 'react';
import type { IconType } from '~/modules/common/stepper/types';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { cn } from '~/utils/cn';

interface StepIconProps {
  isCompletedStep?: boolean;
  isCurrentStep?: boolean;
  isError?: boolean;
  isLoading?: boolean;
  isKeepError?: boolean;
  icon?: IconType;
  index?: number;
  checkIcon?: IconType;
  errorIcon?: IconType;
}

const iconVariants = cva('', {
  variants: {
    size: {
      sm: 'size-4',
      md: 'size-4',
      lg: 'size-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

function StepIconBase(props: StepIconProps, ref: React.ForwardedRef<HTMLDivElement>) {
  const { size } = useStepper();

  const {
    isCompletedStep,
    isCurrentStep,
    isError,
    isLoading,
    isKeepError,
    icon: CustomIcon,
    index,
    checkIcon: CustomCheckIcon,
    errorIcon: CustomErrorIcon,
  } = props;

  const Icon = CustomIcon ? CustomIcon : null;

  const ErrorIcon = CustomErrorIcon ? CustomErrorIcon : null;

  const Check = CustomCheckIcon ? CustomCheckIcon : CheckIcon;

  const iconContent = (() => {
    if (isCompletedStep) {
      if (isError && isKeepError) {
        return (
          <div key="icon">
            <XIcon className={cn(iconVariants({ size }))} />
          </div>
        );
      }
      return (
        <div key="check-icon">
          <Check className={cn(iconVariants({ size }))} />
        </div>
      );
    }
    if (isCurrentStep) {
      if (isError && ErrorIcon) {
        return (
          <div key="error-icon">
            <ErrorIcon className={cn(iconVariants({ size }))} />
          </div>
        );
      }
      if (isError) {
        return (
          <div key="icon">
            <XIcon className={cn(iconVariants({ size }))} />
          </div>
        );
      }
      if (isLoading) {
        return <Loader2Icon className={cn(iconVariants({ size }), 'animate-spin')} />;
      }
    }
    if (Icon) {
      return (
        <div key="step-icon">
          <Icon className={cn(iconVariants({ size }))} />
        </div>
      );
    }
    return (
      <span ref={ref} key="label" className={cn('font-medium text-center text-md')}>
        {(index || 0) + 1}
      </span>
    );
  })();

  return iconContent;
}

const StepIcon = React.forwardRef<HTMLDivElement, StepIconProps>(StepIconBase);

export { StepIcon };
