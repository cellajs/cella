'use client';

import * as React from 'react';
import { StepperProvider } from '~/modules/common/stepper/context';
import { Step } from '~/modules/common/stepper/step';
import type { StepItem, StepProps, StepperProps } from '~/modules/common/stepper/types';
import { useMediaQuery } from '~/modules/common/stepper/use-media-query';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { cn } from '~/utils/cn';

const VARIABLE_SIZES = {
  sm: '2.25rem',
  md: '2.5rem',
  lg: '2.75rem',
};

const Stepper = React.forwardRef<HTMLDivElement, StepperProps>((props, ref: React.Ref<HTMLDivElement>) => {
  const {
    className,
    children,
    orientation: orientationProp = 'horizontal',
    state,
    responsive = true,
    checkIcon,
    errorIcon,
    onClickStep,
    mobileBreakpoint,
    expandVerticalSteps = false,
    initialStep = 0,
    size = 'md',
    steps,
    variant,
    styles,
    variables,
    scrollTracking = false,
    ...rest
  } = props;

  const childArr = React.Children.toArray(children);

  const items: React.ReactElement[] = [];

  const footer = childArr.map((child, _index) => {
    if (!React.isValidElement(child)) {
      throw new Error('Stepper children must be valid React elements.');
    }
    if (child.type === Step) {
      items.push(child);
      return null;
    }

    return child;
  });

  const stepCount = items.length;

  const isMobile = useMediaQuery(`(max-width: ${mobileBreakpoint || '48rem'})`);

  const clickable = !!onClickStep;

  const orientation = isMobile && responsive ? 'vertical' : orientationProp;

  const isVertical = orientation === 'vertical';

  return (
    <StepperProvider
      value={{
        initialStep,
        orientation,
        state,
        size,
        responsive,
        checkIcon,
        errorIcon,
        onClickStep,
        clickable,
        stepCount,
        isVertical,
        variant: variant || 'circle',
        expandVerticalSteps,
        steps,
        scrollTracking,
        styles,
      }}
    >
      <div
        ref={ref}
        className={cn(
          'stepper__main-container',
          'flex w-full flex-wrap',
          stepCount === 1 ? 'justify-end' : 'justify-between',
          orientation === 'vertical' ? 'flex-col' : 'flex-row',
          variant === 'line' && orientation === 'horizontal' && 'gap-4',
          className,
          styles?.['main-container'],
        )}
        style={
          {
            '--step-icon-size': variables?.['--step-icon-size'] || `${VARIABLE_SIZES[size || 'md']}`,
            '--step-gap': variables?.['--step-gap'] || '0.5rem',
          } as React.CSSProperties
        }
        {...rest}
      >
        <VerticalContent>{items}</VerticalContent>
      </div>
      {orientation === 'horizontal' && <HorizontalContent>{items}</HorizontalContent>}
      {footer}
    </StepperProvider>
  );
});

const VerticalContent = ({ children }: { children: React.ReactNode }) => {
  const { activeStep } = useStepper();

  const childArr = React.Children.toArray(children);
  const stepCount = childArr.length;

  return (
    <>
      {React.Children.map(children, (child, i) => {
        const isCompletedStep =
          (React.isValidElement(child) &&
            // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
            (child.props as any).isCompletedStep) ??
          i < activeStep;
        const isLastStep = i === stepCount - 1;
        const isCurrentStep = i === activeStep;

        const stepProps = {
          index: i,
          isCompletedStep,
          isCurrentStep,
          isLastStep,
        };

        if (React.isValidElement(child)) {
          return React.cloneElement(child, stepProps);
        }
        return null;
      })}
    </>
  );
};

const HorizontalContent = ({ children }: { children: React.ReactNode }) => {
  const { activeStep } = useStepper();
  const childArr = React.Children.toArray(children);

  if (activeStep > childArr.length) {
    return null;
  }

  return (
    <>
      {React.Children.map(childArr[activeStep], (node) => {
        if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
          return null;
        }
        return React.Children.map(node.props.children, (childNode) => childNode);
      })}
    </>
  );
};

export { Step, Stepper, useStepper };
export type { StepItem, StepProps, StepperProps };
