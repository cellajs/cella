import type { Meta, StoryObj } from '@storybook/react-vite';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SelectRole } from '~/modules/common/form-fields/select-role';

const meta = {
  title: 'common/SelectRole',
  component: SelectRole,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectRole>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: undefined,
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>(undefined);

    return (
      <div className="w-80">
        <SelectRole value={value} onChange={setValue} />
      </div>
    );
  },
};

export const EntityRoles: Story = {
  args: {
    entity: true,
    value: 'all',
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>('all');

    return (
      <div className="w-80">
        <SelectRole entity value={value} onChange={setValue} />
      </div>
    );
  },
};

export const Preselected: Story = {
  args: {
    entity: true,
    value: 'owner',
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>('owner');

    return (
      <div className="w-80">
        <SelectRole entity value={value} onChange={setValue} />
      </div>
    );
  },
};

export const Offline: Story = {
  args: {
    value: undefined,
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>(undefined);

    useEffect(() => {
      onlineManager.setOnline(false);
      return () => onlineManager.setOnline(true);
    }, []);

    return (
      <div className="w-80">
        <SelectRole value={value} onChange={setValue} />
      </div>
    );
  },
};
