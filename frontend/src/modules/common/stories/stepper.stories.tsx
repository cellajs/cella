import type { Meta, StoryObj } from '@storybook/react-vite';
import { XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Step, Stepper, useStepper } from '~/modules/common/stepper/stepper';
import type { StepItem } from '~/modules/common/stepper/types';
import { Button } from '~/modules/ui/button';

const steps: StepItem[] = [
  { id: 'profile', label: 'Profile', optional: true },
  { id: 'organization', label: 'Organization', optional: true },
  { id: 'invite', label: 'Invite' },
];

/** Stands in for the onboarding footer: reads the stepper state and moves on from inside a step. */
function StepFooter({ onComplete }: { onComplete: () => void }) {
  const { nextStep, currentStep, isOptionalStep, hasCompletedAllSteps } = useStepper();

  useEffect(() => {
    if (hasCompletedAllSteps) onComplete();
  }, [hasCompletedAllSteps]);

  return (
    <div className="flex items-center gap-2 py-2">
      <span>
        {currentStep?.id} {isOptionalStep ? 'optional' : 'required'}
      </span>
      <Button onClick={nextStep}>Next</Button>
    </div>
  );
}

function OnboardingLikeStepper({ items, initialStep = 0 }: { items: StepItem[]; initialStep?: number }) {
  const [completed, setCompleted] = useState(false);

  return (
    <div className="w-[36rem]">
      <Stepper initialStep={initialStep} steps={items} onClickStep={(newStep, setStep) => setStep(newStep)} orientation="vertical">
        {items.map(({ id, label }) => (
          <Step key={id} label={label} isKeepError={id !== 'profile'} checkIcon={id === 'organization' ? XIcon : undefined}>
            <div className="rounded-md border p-4">
              <p>{label} content</p>
              <StepFooter onComplete={() => setCompleted(true)} />
            </div>
          </Step>
        ))}
      </Stepper>
      {completed && <p>All steps completed</p>}
    </div>
  );
}

/** Uses the hook without a surrounding stepper, as the profile and organization forms do outside onboarding. */
function StepperlessForm() {
  const { nextStep, currentStep, isOptionalStep } = useStepper();
  const [submitted, setSubmitted] = useState(false);

  return (
    <div>
      <p>current step: {currentStep?.id ?? 'none'}</p>
      <p>optional: {String(isOptionalStep)}</p>
      <Button
        onClick={() => {
          nextStep?.();
          setSubmitted(true);
        }}
      >
        Submit
      </Button>
      {submitted && <p>Submitted</p>}
    </div>
  );
}

/**
 * The vertical stepper that onboarding renders: each step shows a numbered button and a label, and only the current
 * step's content is expanded. Completed steps show a check, or the step's own `checkIcon`.
 */
const meta = {
  title: 'common/Stepper',
  component: OnboardingLikeStepper,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { items: steps },
} satisfies Meta<typeof OnboardingLikeStepper>;

export default meta;
type Story = StoryObj<typeof meta>;

const checkButton = (root: HTMLElement, icon: 'check' | 'x') => root.querySelector(`svg.lucide-${icon}`)?.closest('button') ?? null;

export const Default: Story = {};

export const ShouldAdvanceAndCollapse: Story = {
  name: 'when a step calls nextStep, should collapse it, mark it completed and expand the next one',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('only the first step is expanded and current', async () => {
      await expect(canvas.getByText('Profile content')).toBeVisible();
      await expect(canvas.queryByText('Organization content')).not.toBeInTheDocument();
      await expect(canvas.getByText('profile optional')).toBeVisible();
      await expect(canvas.getByRole('button', { current: 'step' })).toHaveTextContent('1');
      for (const label of ['Profile', 'Organization', 'Invite']) await expect(canvas.getByText(label)).toBeVisible();
      for (const number of ['1', '2', '3']) await expect(canvas.getByRole('button', { name: number })).toBeVisible();
    });

    await step('nextStep from inside the step moves on', async () => {
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
      await expect(await canvas.findByText('Organization content')).toBeVisible();
      await waitFor(() => expect(canvas.queryByText('Profile content')).not.toBeInTheDocument());
      await expect(canvas.getByRole('button', { current: 'step' })).toHaveTextContent('2');
    });

    await step('the completed step shows a check in place of its number', async () => {
      await expect(canvas.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
      await expect(checkButton(canvasElement, 'check')).not.toBeNull();
    });

    await step('a step with its own checkIcon shows that icon once completed', async () => {
      await expect(checkButton(canvasElement, 'x')).toBeNull();
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
      await expect(await canvas.findByText('invite required')).toBeVisible();
      await waitFor(() => expect(canvas.queryByText('Organization content')).not.toBeInTheDocument());
      await expect(checkButton(canvasElement, 'x')).not.toBeNull();
      await expect(canvas.queryByRole('button', { name: '2' })).not.toBeInTheDocument();
    });

    await step('nextStep on the last step completes the stepper', async () => {
      await expect(canvas.queryByText('All steps completed')).not.toBeInTheDocument();
      await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
      await expect(await canvas.findByText('All steps completed')).toBeVisible();
      await waitFor(() => expect(canvas.queryByText('Invite content')).not.toBeInTheDocument());
      await expect(canvas.queryByRole('button', { current: 'step' })).not.toBeInTheDocument();
    });
  },
};

export const ShouldJumpOnClick: Story = {
  name: 'when a step button is clicked, should expand that step, ahead or back',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);

    await step('jump ahead to the last step', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '3' }));
      await expect(await canvas.findByText('Invite content')).toBeVisible();
      await waitFor(() => expect(canvas.queryByText('Profile content')).not.toBeInTheDocument());
      await expect(canvas.getByRole('button', { current: 'step' })).toHaveTextContent('3');
    });

    await step('steps before the current one show as completed', async () => {
      await expect(checkButton(canvasElement, 'check')).not.toBeNull();
      await expect(checkButton(canvasElement, 'x')).not.toBeNull();
    });

    await step('jump back to a completed step', async () => {
      const first = checkButton(canvasElement, 'check');
      if (!first) throw new Error('completed step button not found');
      await userEvent.click(first);
      await expect(await canvas.findByText('Profile content')).toBeVisible();
      await waitFor(() => expect(canvas.queryByText('Invite content')).not.toBeInTheDocument());
      await expect(canvas.getByRole('button', { current: 'step' })).toHaveTextContent('1');
      await expect(canvas.getByRole('button', { name: '2' })).toBeVisible();
    });
  },
};

export const ShouldStartAtInitialStep: Story = {
  name: 'when given an initial step, should start there with earlier steps completed',
  tags: ['!dev', '!autodocs'],
  args: { initialStep: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Organization content')).toBeVisible();
    await expect(canvas.queryByText('Profile content')).not.toBeInTheDocument();
    await expect(canvas.getByRole('button', { current: 'step' })).toHaveTextContent('2');
    await expect(checkButton(canvasElement, 'check')).not.toBeNull();
  },
};

export const SingleStep: Story = {
  name: 'when there is one step, should hide the step header and show its content',
  tags: ['!dev', '!autodocs'],
  args: { items: [steps[0]] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('Profile content')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: '1' })).not.toBeInTheDocument();
    await expect(canvas.queryByText('Profile')).not.toBeInTheDocument();
  },
};

export const ShouldWorkWithoutStepper: Story = {
  name: 'when useStepper runs outside a stepper, should return inert defaults',
  tags: ['!dev', '!autodocs'],
  render: () => <StepperlessForm />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('current step: none')).toBeVisible();
    await expect(canvas.getByText('optional: false')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));
    await expect(await canvas.findByText('Submitted')).toBeVisible();
  },
};
