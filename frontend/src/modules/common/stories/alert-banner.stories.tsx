import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from 'lucide-react';
import { AlertBanner } from '~/alerter/alert-banner';

const meta = {
  title: 'common/AlertBanner',
  component: AlertBanner,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AlertBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: 'story-default',
    children: 'This is a default alert banner.',
  },
};

export const WithTitle: Story = {
  args: {
    id: 'story-title',
    title: 'Heads up!',
    children: 'Something important happened that you should know about.',
  },
};

export const WithIcon: Story = {
  args: {
    id: 'story-icon',
    icon: InfoIcon,
    title: 'Information',
    children: 'This alert includes an icon for additional context.',
  },
};

export const Destructive: Story = {
  args: {
    id: 'story-destructive',
    variant: 'destructive',
    icon: AlertTriangleIcon,
    title: 'Error',
    children: 'Something went wrong. Please try again.',
  },
};

export const Success: Story = {
  args: {
    id: 'story-success',
    variant: 'success',
    icon: CheckCircleIcon,
    title: 'Success',
    children: 'Your changes have been saved.',
  },
};

export const Warning: Story = {
  args: {
    id: 'story-warning',
    variant: 'warning',
    icon: AlertTriangleIcon,
    title: 'Warning',
    children: 'This action cannot be undone.',
  },
};

export const Animated: Story = {
  args: {
    id: 'story-animated',
    animate: true,
    icon: InfoIcon,
    title: 'Animated alert',
    children: 'This alert uses enter/exit animations.',
  },
};
