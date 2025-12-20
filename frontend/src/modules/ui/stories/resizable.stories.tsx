import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ResizableGroup, ResizablePanel, ResizableSeparator } from '~/modules/ui/resizable';

/**
 * Accessible resizable panel groups and layouts with keyboard support.
 */
const meta: Meta<typeof ResizableGroup> = {
  title: 'ui/ResizableGroup',
  component: ResizableGroup,
  tags: ['autodocs'],
  argTypes: {
    onLayoutChange: {
      control: false,
    },
  },
  args: {
    onLayoutChange: fn(),
    className: 'max-w-96 rounded-lg border',
    orientation: 'horizontal',
  },
  render: (args) => (
    <ResizableGroup {...args}>
      <ResizablePanel>
        <div className="flex h-50 items-center justify-center p-6">
          <span className="font-semibold">One</span>
        </div>
      </ResizablePanel>
      <ResizableSeparator />
      <ResizablePanel>
        <ResizableGroup orientation="vertical">
          <ResizablePanel>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Two</span>
            </div>
          </ResizablePanel>
          <ResizableSeparator />
          <ResizablePanel>
            <div className="flex h-full items-center justify-center p-6">
              <span className="font-semibold">Three</span>
            </div>
          </ResizablePanel>
        </ResizableGroup>
      </ResizablePanel>
    </ResizableGroup>
  ),
} satisfies Meta<typeof ResizableGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the resizable panel group.
 */
export const Default: Story = {};
