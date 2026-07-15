import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { RenderExpandToggle } from '~/modules/common/data-grid/cell-renderers';

/**
 * Focusable expand/collapse toggle for tree-style tables; renders an SVG connector behind the chevron so nested
 * rows visually flow into their ancestors. See `data-table/tree/` (`useTreeRows` + `<TreeProvider>` +
 * `ExpandToggleColumn`) for the full integration.
 *
 * Visual language (trees of 2–3 levels): root (`depth 0`) chevron only; inner 2px solid lines + filled bullet
 * for leaves; deepest (`depth = maxDepth - 1`) 1px thin lines + hollow bullet on a deeper track.
 */
const meta = {
  title: 'common/RenderExpandToggle',
  component: RenderExpandToggle,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    depth: { control: { type: 'number', min: 0, max: 4 } },
    rowHeight: { control: { type: 'number', min: 30, max: 120 } },
    maxDepth: { control: { type: 'number', min: 1, max: 6 } },
    expanded: { control: 'boolean' },
    hasChildren: { control: 'boolean' },
    isLastChild: { control: 'boolean' },
    parentIsLastChild: { control: 'boolean' },
  },
  args: {
    expanded: false,
    hasChildren: true,
    rowHeight: 60,
    depth: 0,
    isLastChild: false,
    parentIsLastChild: false,
    maxDepth: 3,
    onToggle: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 36, height: 60 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RenderExpandToggle>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Root row with an expandable subtree: chevron only, no connectors. */
export const Root: Story = {};

/** Root row with no children: renders nothing at depth 0. */
export const RootLeaf: Story = {
  args: { hasChildren: false },
};

/** Inner row (depth 1) with children. Solid 2px connectors. */
export const InnerExpanded: Story = {
  args: { depth: 1, expanded: true, hasChildren: true },
};

/** Inner leaf row (depth 1, no children). Filled bullet on the centered track. */
export const InnerLeaf: Story = {
  args: { depth: 1, hasChildren: false },
};

/** Deepest row (depth 2 of maxDepth 3) with no children. Thin lines + hollow bullet on the deeper track. */
export const DeepestLeaf: Story = {
  args: { depth: 2, hasChildren: false, maxDepth: 3 },
};

/** Deepest row that is also the last child; connector below should not be drawn. */
export const DeepestLeafLastChild: Story = {
  args: { depth: 2, hasChildren: false, isLastChild: true, maxDepth: 3 },
};

/** Inner row whose parent is itself a last child; depth-1 trunk should NOT continue. */
export const DeepestParentIsLast: Story = {
  args: { depth: 2, hasChildren: false, parentIsLastChild: true, maxDepth: 3 },
};

/**
 * Interaction test: clicking the toggle button calls `onToggle`. Tagged
 * `!dev`/`!autodocs` so it doesn't show up in the docs sidebar.
 */
export const ShouldFireOnToggle: Story = {
  name: 'when chevron clicked, should call onToggle',
  tags: ['!dev', '!autodocs'],
  args: {
    depth: 1,
    hasChildren: true,
  },
  render: function Render(args) {
    const [calls, setCalls] = useState(0);
    return (
      <div data-testid="toggle-host" data-calls={calls}>
        <RenderExpandToggle {...args} onToggle={() => setCalls((c) => c + 1)} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', { name: /collapse|expand/i });
    await userEvent.click(button);
    await userEvent.click(button, { delay: 50 });
    const host = await canvas.findByTestId('toggle-host');
    expect(host.dataset.calls).toBe('2');
  },
};
