import type { Meta, StoryObj } from '@storybook/react-vite';
import { onlineManager } from '@tanstack/react-query';
import { ArrowDownAZIcon, CalendarIcon, ListFilterIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SelectSort } from '~/modules/common/form-fields/select-sort';

const sortOptions = [
  { name: 'c:alphabetical', icon: ArrowDownAZIcon, value: 'name' },
  { name: 'c:created_at', icon: CalendarIcon, value: 'createdAt' },
  { name: 'c:filters', icon: ListFilterIcon, value: 'manual' },
] as const;

const meta = {
  title: 'common/SelectSort',
  component: SelectSort,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SelectSort<typeof sortOptions>>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IconOnly: Story = {
  args: {
    value: 'name',
    onChange: () => {},
    sortOptions,
  },
  render: function Render() {
    const [value, setValue] = useState<(typeof sortOptions)[number]['value']>('name');

    return <SelectSort value={value} onChange={setValue} sortOptions={sortOptions} />;
  },
};

export const WithLabel: Story = {
  args: {
    value: 'createdAt',
    onChange: () => {},
    sortOptions,
    iconOnly: false,
  },
  render: function Render() {
    const [value, setValue] = useState<(typeof sortOptions)[number]['value']>('createdAt');

    return <SelectSort value={value} onChange={setValue} sortOptions={sortOptions} iconOnly={false} className="w-48" />;
  },
};

export const CustomWidth: Story = {
  args: {
    value: 'manual',
    onChange: () => {},
    sortOptions,
    iconOnly: false,
  },
  render: function Render() {
    const [value, setValue] = useState<(typeof sortOptions)[number]['value']>('manual');

    return <SelectSort value={value} onChange={setValue} sortOptions={sortOptions} iconOnly={false} className="w-56" />;
  },
};

export const Offline: Story = {
  args: {
    value: 'name',
    onChange: () => {},
    sortOptions,
  },
  render: function Render() {
    const [value, setValue] = useState<(typeof sortOptions)[number]['value']>('name');

    useEffect(() => {
      onlineManager.setOnline(false);
      return () => onlineManager.setOnline(true);
    }, []);

    return <SelectSort value={value} onChange={setValue} sortOptions={sortOptions} />;
  },
};
