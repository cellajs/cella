import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor } from 'storybook/test';

import { Label } from '~/modules/ui/label';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';

/**
 * A set of checkable buttons—known as radio buttons—where no more than one of
 * the buttons can be checked at a time.
 */
const meta = {
  title: 'ui/RadioGroup',
  component: RadioGroup,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    defaultValue: 'comfortable',
    className: 'grid gap-2 grid-cols-[1rem_1fr] items-center',
  },
  render: (args) => (
    <RadioGroup {...args}>
      <RadioGroupItem value="default" id="r1" />
      <Label htmlFor="r1">Default</Label>
      <RadioGroupItem value="comfortable" id="r2" />
      <Label htmlFor="r2">Comfortable</Label>
      <RadioGroupItem value="compact" id="r3" />
      <Label htmlFor="r3">Compact</Label>
    </RadioGroup>
  ),
} satisfies Meta<typeof RadioGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the radio group.
 */
export const Default: Story = {};

export const ShouldToggleRadio: Story = {
  name: 'when clicking on a radio button, it should toggle its state',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    const radios = await canvas.findAllByRole('radio');
    expect(radios).toHaveLength(3);

    await step('click the default radio button', async () => {
      await userEvent.click(radios[0]);
      await waitFor(() => expect(radios[0]).toBeChecked());
      await waitFor(() => expect(radios[1]).not.toBeChecked());
    });

    await step('click the comfortable radio button', async () => {
      await userEvent.click(radios[1]);
      await waitFor(() => expect(radios[1]).toBeChecked());
      await waitFor(() => expect(radios[0]).not.toBeChecked());
    });
  },
};
