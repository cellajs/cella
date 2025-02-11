import * as React from 'react';
import { StepButtonContainer } from '~/modules/common/stepper/step-button-container';
import { StepIcon } from '~/modules/common/stepper/step-icon';
import { StepLabel } from '~/modules/common/stepper/step-label';
import type { StepSharedProps } from '~/modules/common/stepper/types';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { cn } from '~/utils/cn';

const HorizontalStep = React.forwardRef<HTMLDivElement, StepSharedProps>((props, ref) => {
  const {
    isError,
    isLoading,
    onClickStep,
    variant,
    clickable,
    checkIcon: checkIconContext,
    errorIcon: errorIconContext,
    styles,
    steps,
    setStep,
  } = useStepper();

  const {
    index,
    isCompletedStep,
    isCurrentStep,
    hasVisited,
    icon,
    label,
    description,
    isKeepError,
    state,
    checkIcon: checkIconProp,
    errorIcon: errorIconProp,
  } = props;

  const localIsLoading = isLoading || state === 'loading';
  const localIsError = isError || state === 'error';

  const opacity = hasVisited ? 1 : 0.8;

  const active = variant === 'line' ? isCompletedStep || isCurrentStep : isCompletedStep;

  const checkIcon = checkIconProp || checkIconContext;
  const errorIcon = errorIconProp || errorIconContext;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      aria-disabled={!hasVisited}
      className={cn(
        'stepper__horizontal-step',
        'flex items-center relative transition-all duration-200',
        'not-last:flex-1',
        'not-last:after:transition-all not-last:after:duration-200',
        "not-last:after:content-[''] not-last:after:h-0.5 not-last:after:bg-border",
        'data-[completed=true]:not-last:after:bg-primary',
        'data-[invalid=true]:not-last:after:bg-destructive',
        variant === 'circle-alt' &&
          'justify-start flex-col flex-1 not-last:after:relative not-last:after:order-[-1] not-last:after:start-[50%] not-last:after:end-[50%] not-last:after:top-[calc(var(--step-icon-size)/2)] not-last:after:w-[calc((100%-var(--step-icon-size))-(var(--step-gap)))]',
        variant === 'circle' && 'not-last:after:flex-1 not-last:after:ms-(--step-gap) not-last:after:me-(--step-gap)',
        variant === 'line' && 'flex-col flex-1 border-t-[.19rem] data-[active=true]:border-primary',
        styles?.['horizontal-step'],
      )}
      data-optional={steps[index || 0]?.optional}
      data-completed={isCompletedStep}
      data-active={active}
      data-invalid={localIsError}
      data-clickable={clickable}
      onClick={() => onClickStep?.(index || 0, setStep)}
      ref={ref}
    >
      <div
        className={cn(
          'stepper__horizontal-step-container',
          'flex items-center',
          variant === 'circle-alt' && 'flex-col justify-center gap-1',
          variant === 'line' && 'w-full',
          styles?.['horizontal-step-container'],
        )}
      >
        <StepButtonContainer {...{ ...props, isError: localIsError, isLoading: localIsLoading }}>
          <StepIcon
            {...{
              index,
              isCompletedStep,
              isCurrentStep,
              isError: localIsError,
              isKeepError,
              isLoading: localIsLoading,
            }}
            icon={icon}
            checkIcon={checkIcon}
            errorIcon={errorIcon}
          />
        </StepButtonContainer>
        <StepLabel label={label} description={description} {...{ isCurrentStep, opacity }} />
      </div>
    </div>
  );
});

export { HorizontalStep };
