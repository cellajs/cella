import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { EntityRole } from 'shared';
import { SelectRoles } from '~/modules/common/form-fields/select-roles';

const meta = {
  title: 'common/SelectRoles',
  component: SelectRoles,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectRoles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: [],
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>([]);

    return <SelectRoles value={value} onValueChange={setValue} />;
  },
};

export const Preselected: Story = {
  args: {
    value: ['member'],
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>(['member']);

    return <SelectRoles value={value} onValueChange={setValue} />;
  },
};

export const MultipleSelected: Story = {
  args: {
    value: ['member', 'admin'],
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>(['member', 'admin']);

    return <SelectRoles value={value} onValueChange={setValue} />;
  },
};

export const WrappedLayout: Story = {
  args: {
    value: ['member'],
    onValueChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<EntityRole[]>(['member']);

    return (
      <div className="w-64 rounded-lg border p-4">
        <SelectRoles value={value} onValueChange={setValue} className="flex-wrap items-start" />
      </div>
    );
  },
};
