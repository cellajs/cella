import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { EntityRole } from 'shared';
import { expect, userEvent, waitFor } from 'storybook/test';
import { SelectRoleRadio } from '~/modules/common/form-fields/select-role-radio';

const meta = {
  title: 'common/SelectRoleRadio',
  component: SelectRoleRadio,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectRoleRadio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: undefined,
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole | undefined>(undefined);

    return <SelectRoleRadio value={value} onValueChange={setValue} />;
  },
};

export const Selected: Story = {
  args: {
    value: 'admin',
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole | undefined>('admin');

    return <SelectRoleRadio value={value} onValueChange={setValue} />;
  },
};

export const WrappedLayout: Story = {
  args: {
    value: 'member',
    onValueChange: () => {},
    className: 'flex-wrap items-start gap-3',
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole | undefined>('member');

    return (
      <div className="w-72 rounded-lg border p-4">
        <SelectRoleRadio value={value} onValueChange={setValue} className="flex-wrap items-start gap-3" />
      </div>
    );
  },
};

export const ShouldSelectRole: Story = {
  name: 'when clicking a role radio, should select it',
  tags: ['!dev', '!autodocs'],
  args: {
    value: undefined,
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole | undefined>(undefined);

    return <SelectRoleRadio value={value} onValueChange={setValue} />;
  },
  play: async ({ canvas, step }) => {
    const radios = await canvas.findAllByRole('radio');

    await step('select the first role', async () => {
      await userEvent.click(radios[0]);
      await waitFor(() => expect(radios[0]).toBeChecked());
    });

    await step('select another role', async () => {
      await userEvent.click(radios[1]);
      await waitFor(() => expect(radios[1]).toBeChecked());
      await waitFor(() => expect(radios[0]).not.toBeChecked());
    });
  },
};
