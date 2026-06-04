import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
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
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string[]>([]);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const Preselected: Story = {
  args: {
    value: ['owner'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string[]>(['owner']);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const MultipleSelected: Story = {
  args: {
    value: ['owner', 'admin'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string[]>(['owner', 'admin']);

    return <SelectRoles value={value} onChange={setValue} />;
  },
};

export const WrappedLayout: Story = {
  args: {
    value: ['member'],
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string[]>(['member']);

    return (
      <div className="w-64 rounded-lg border p-4">
        <SelectRoles value={value} onChange={setValue} className="flex-wrap items-start" />
      </div>
    );
  },
};
