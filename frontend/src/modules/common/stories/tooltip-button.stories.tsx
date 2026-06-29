import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings } from 'lucide-react';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';

const meta = {
  title: 'common/TooltipButton',
  component: TooltipButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof TooltipButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    toolTipContent: 'Settings',
    children: (
      <Button variant="outline" size="icon">
        <Settings size={16} />
      </Button>
    ),
  },
};

export const SideTop: Story = {
  args: {
    toolTipContent: 'Tooltip on top',
    side: 'top',
    children: <Button variant="outline">Hover me</Button>,
  },
};

export const SideLeft: Story = {
  args: {
    toolTipContent: 'Tooltip on left',
    side: 'left',
    children: <Button variant="outline">Hover me</Button>,
  },
};

export const SideRight: Story = {
  args: {
    toolTipContent: 'Tooltip on right',
    side: 'right',
    children: <Button variant="outline">Hover me</Button>,
  },
};

export const Disabled: Story = {
  args: {
    toolTipContent: 'This tooltip is disabled',
    disabled: true,
    children: <Button variant="outline">No tooltip</Button>,
  },
};
