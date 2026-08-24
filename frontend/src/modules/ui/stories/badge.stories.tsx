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

const BADGE_VARIANTS = [
  'default',
  'brand',
  'destructive',
  'success',
  'warning',
  'secondary',
  'plain',
  'outline',
] as const;

/** Every badge variant in soft and solid fill, side by side, to catch soft text losing the cascade. */
export const VariantMatrix: Story = {
  parameters: { controls: { disable: true }, layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-4">
      {([true, false] as const).map((soft) => (
        <div key={String(soft)} className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase">{soft ? 'soft' : 'solid'}</p>
          <div className="flex flex-wrap items-center gap-2">
            {BADGE_VARIANTS.map((variant) => (
              <Badge key={variant} variant={variant} soft={soft} size="md">
                {variant}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};
