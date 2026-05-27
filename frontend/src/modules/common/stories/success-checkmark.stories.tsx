import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { SuccessCheckmark } from '~/modules/common/success-checkmark';

const meta = {
  title: 'common/SuccessCheckmark',
  component: SuccessCheckmark,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SuccessCheckmark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: { className: 'size-12' },
};

export const Large: Story = {
  args: { className: 'size-40' },
};

export const Loop: Story = {
  render: (args) => {
    const [key, setKey] = useState(0);
    useEffect(() => {
      const id = setInterval(() => setKey((k) => k + 1), 3000);
      return () => clearInterval(id);
    }, []);
    return <SuccessCheckmark key={key} {...args} />;
  },
};
