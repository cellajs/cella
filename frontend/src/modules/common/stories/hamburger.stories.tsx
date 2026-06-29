import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { HamburgerButton } from '~/modules/common/hamburger';

const meta = {
  title: 'common/HamburgerButton',
  component: HamburgerButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HamburgerButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {
  args: { isOpen: false, toggle: () => {} },
};

export const Open: Story = {
  args: { isOpen: true, toggle: () => {} },
};

export const Interactive: Story = {
  args: { isOpen: false, toggle: () => {} },
  render: function Render() {
    const [isOpen, setIsOpen] = useState(false);
    return <HamburgerButton isOpen={isOpen} toggle={() => setIsOpen(!isOpen)} />;
  },
};
