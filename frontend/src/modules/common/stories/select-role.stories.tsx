import type { Meta, StoryObj } from '@storybook/react-vite';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hierarchy } from 'shared';
import { SelectRole } from '~/modules/common/form-fields/select-role';

/** The root vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole(hierarchy.rootChannelType);

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
    entityType: 'organization',
    value: 'all',
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>('all');

    return (
      <div className="w-80">
        <SelectRole entityType="organization" value={value} onChange={setValue} />
      </div>
    );
  },
};

export const Preselected: Story = {
  args: {
    entityType: 'organization',
    value: memberRole,
    onChange: () => {},
  },
  render: function Render() {
    const [value, setValue] = useState<string | undefined>(memberRole);

    return (
      <div className="w-80">
        <SelectRole entityType="organization" value={value} onChange={setValue} />
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
