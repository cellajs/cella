import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ResizablePanel, ResizablePanelGroup, ResizableSeparator } from '~/modules/common/resizable-panels';

/**
 * Accessible resizable panel groups and layouts with keyboard support.
 */
const meta: Meta<typeof ResizablePanelGroup> = {
  title: 'ui/ResizablePanelGroup',
  component: ResizablePanelGroup,
  tags: ['autodocs'],
  argTypes: {
    onLayoutChanged: {
      control: false,
    },
  },
  args: {
    onLayoutChanged: fn(),
    id: 'story-group',
    className: 'max-w-[600px] rounded-lg border',
  },
  render: (args) => (
    <ResizablePanelGroup {...args}>
      <ResizablePanel id="one" minWidth={100}>
        <div className="flex h-50 items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableSeparator index={0} className="w-px bg-border" />
      <ResizablePanel id="two" minWidth={100}>
        <div className="flex h-50 items-center justify-center p-6">
          <span className="font-semibold">Two</span>
        </div>
      </ResizablePanel>
      <ResizableSeparator index={1} className="w-px bg-border" />
      <ResizablePanel id="three" minWidth={100}>
        <div className="flex h-50 items-center justify-center p-6">
          <span className="font-semibold">Three</span>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
} satisfies Meta<typeof ResizablePanelGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the resizable panel group.
 */
export const Default: Story = {};
