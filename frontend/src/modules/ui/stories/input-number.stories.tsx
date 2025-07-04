import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { InputNumberProp } from '../input-number';

import { InputNumber } from '../input-number';
import { Label } from '../label';

// Wrapper component for testing with state
const ControlledInputNumber = ({ initialValue = 0, ...props }: { initialValue?: number } & InputNumberProp) => {
  const [value, setValue] = useState(initialValue);

  return (
    <InputNumber
      {...props}
      value={value}
      onValueChange={(val) => {
        setValue(val);
        props.onValueChange?.(val);
      }}
    />
  );
};

/**
 * A number input component with increment and decrement buttons for easy value adjustment.
 */
const meta: Meta<typeof ControlledInputNumber> = {
  title: 'ui/InputNumber',
  component: ControlledInputNumber,
  tags: ['autodocs'],
  argTypes: {
    initialValue: {
      control: 'number',
      description: 'Initial value for the input',
    },
    min: {
      control: 'number',
      description: 'Minimum value allowed',
    },
    max: {
      control: 'number',
      description: 'Maximum value allowed',
    },
    step: {
      control: 'number',
      description: 'Step increment for buttons',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the input',
    },
  },
  args: {
    initialValue: 0,
    className: 'w-96',
    placeholder: '0',
    step: 1,
    disabled: false,
    onValueChange: fn(),
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ControlledInputNumber>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the number input with increment/decrement buttons.
 */
export const Default: Story = {};

/**
 * Use the `disabled` prop to make the input non-interactive and appears faded,
 * indicating that input is not currently accepted.
 */
export const Disabled: Story = {
  args: {
    initialValue: 5,
    disabled: true,
  },
};

/**
 * Set minimum and maximum values to constrain the input range.
 */
export const WithMinMax: Story = {
  args: {
    initialValue: 5,
    min: 0,
    max: 10,
  },
};

/**
 * Use a custom step value for increment/decrement operations.
 */
export const WithCustomStep: Story = {
  args: {
    initialValue: 2.5,
    step: 0.5,
    min: 0,
    max: 10,
  },
};

/**
 * Use the `Label` component to include a clear, descriptive label above or
 * alongside the input area to guide users.
 */
export const WithLabel: Story = {
  args: {
    initialValue: 1,
    min: 1,
    max: 100,
  },
  render: (args) => (
    <div className="grid items-center gap-1.5">
      <Label htmlFor="quantity">Quantity</Label>
      <ControlledInputNumber {...args} id="quantity" />
    </div>
  ),
};

/**
 * Use a text element below the input field to provide additional instructions
 * or information to users.
 */
export const WithHelperText: Story = {
  args: {
    initialValue: 1,
    min: 1,
    max: 100,
  },
  render: (args) => (
    <div className="grid items-center gap-1.5">
      <Label htmlFor="quantity-2">Quantity</Label>
      <ControlledInputNumber {...args} id="quantity-2" />
      <p className="text-foreground/60 text-sm">Select a quantity between 1 and 100.</p>
    </div>
  ),
};

/**
 * Decimal values with custom step increments.
 */
export const DecimalValues: Story = {
  args: {
    initialValue: 1.5,
    step: 0.1,
    min: 0,
    max: 5,
    placeholder: '0.0',
  },
};

export const ShouldIncrementValue: Story = {
  name: 'when plus button is clicked, should increment value',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={5} step={1} onValueChange={fn()} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const plusButton = await canvas.findByRole('button', { name: /increment/i });

    await step('verify initial value', async () => {
      expect(input).toHaveValue(5);
    });

    await step('click plus button to increment', async () => {
      await userEvent.click(plusButton);
    });

    await step('verify value increased', async () => {
      expect(input).toHaveValue(6);
    });
  },
};

export const ShouldDecrementValue: Story = {
  name: 'when minus button is clicked, should decrement value',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={5} step={1} onValueChange={fn()} className="w-96" />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const minusButton = await canvas.findByRole('button', { name: /decrement/i });

    await step('verify initial value', async () => {
      expect(input).toHaveValue(5);
    });

    await step('click minus button to decrement', async () => {
      await userEvent.click(minusButton);
    });

    await step('verify value decreased', async () => {
      expect(input).toHaveValue(4);
    });
  },
};

export const ShouldRespectMinValue: Story = {
  name: 'when at minimum value, minus button should not decrease further',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={0} min={0} step={1} onValueChange={fn()} className="w-96" />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const minusButton = await canvas.findByRole('button', { name: /decrement/i });

    await step('verify initial value at minimum', async () => {
      expect(input).toHaveValue(0);
    });

    await step('click minus button at minimum value', async () => {
      await userEvent.click(minusButton);
    });

    await step('verify value did not change', async () => {
      expect(input).toHaveValue(0);
    });
  },
};

export const ShouldRespectMaxValue: Story = {
  name: 'when at maximum value, plus button should not increase further',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={10} max={10} step={1} onValueChange={fn()} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const plusButton = await canvas.findByRole('button', { name: /increment/i });

    await step('verify initial value at maximum', async () => {
      expect(input).toHaveValue(10);
    });

    await step('click plus button at maximum value', async () => {
      await userEvent.click(plusButton);
    });

    await step('verify value did not change', async () => {
      expect(input).toHaveValue(10);
    });
  },
};

export const ShouldHandleCustomStep: Story = {
  name: 'when using custom step, should increment/decrement by step value',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={2.5} step={0.5} onValueChange={fn()} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const plusButton = await canvas.findByRole('button', { name: /increment/i });
    const minusButton = await canvas.findByRole('button', { name: /decrement/i });

    await step('verify initial value', async () => {
      expect(input).toHaveValue(2.5);
    });

    await step('increment by custom step', async () => {
      await userEvent.click(plusButton);
    });

    await step('verify incremented by step value', async () => {
      expect(input).toHaveValue(3);
    });

    await step('decrement by custom step', async () => {
      await userEvent.click(minusButton);
    });

    await step('verify decremented by step value', async () => {
      expect(input).toHaveValue(2.5);
    });
  },
};

export const ShouldEnterValue: Story = {
  name: 'when user types in input, should update value',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={0} onValueChange={fn()} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');

    await step('verify initial value', async () => {
      expect(input).toHaveValue(0);
    });

    await step('clear and type new value', async () => {
      await userEvent.clear(input);
      await userEvent.type(input, '25');
    });

    await step('verify input shows typed value', async () => {
      expect(input).toHaveValue(25);
    });
  },
};

export const ShouldRespectDisabledState: Story = {
  name: 'when disabled, buttons should not change value',
  tags: ['!dev', '!autodocs'],
  render: () => <ControlledInputNumber initialValue={5} disabled={true} onValueChange={fn()} />,
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole('spinbutton');
    const plusButton = await canvas.findByRole('button', { name: /increment/i });
    const minusButton = await canvas.findByRole('button', { name: /decrement/i });

    await step('verify initial value', async () => {
      expect(input).toHaveValue(5);
    });

    await step('verify buttons are disabled', async () => {
      expect(plusButton).toBeDisabled();
      expect(minusButton).toBeDisabled();
    });

    await step('verify input is disabled', async () => {
      expect(input).toBeDisabled();
    });

    await step('attempt to click plus button', async () => {
      await userEvent.click(plusButton);
    });

    await step('verify value did not change', async () => {
      expect(input).toHaveValue(5);
    });

    await step('attempt to click minus button', async () => {
      await userEvent.click(minusButton);
    });

    await step('verify value still did not change', async () => {
      expect(input).toHaveValue(5);
    });
  },
};
