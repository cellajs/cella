import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from '~/modules/ui/badge';

/**
 * Displays a badge or a component that looks like a badge.
 */
const meta = {
  title: 'ui/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
    },
  },
  args: {
    children: 'Badge',
  },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Badge>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the badge.
 */
export const Default: Story = {};

/**
 * Use the `secondary` badge to call for less urgent information, blending
 * into the interface while still signaling minor updates or statuses.
 */
export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

/**
 * Use the `plain` badge for the most minimal appearance, blending seamlessly
 * with the background while still providing context.
 */
export const Plain: Story = {
  args: {
    variant: 'plain',
  },
};

/**
 * Use the `success` badge to indicate positive statuses, confirmations,
 * or successful actions.
 */
export const Success: Story = {
  args: {
    variant: 'success',
  },
};

/**
 * Use the `destructive` badge to  indicate errors, alerts, or the need for
 * immediate attention.
 */
export const Destructive: Story = {
  args: {
    variant: 'destructive',
  },
};

/**
 * Use the `outline` badge for overlaying without obscuring interface details,
 * emphasizing clarity and subtlety..
 */
export const Outline: Story = {
  args: {
    variant: 'outline',
  },
};
