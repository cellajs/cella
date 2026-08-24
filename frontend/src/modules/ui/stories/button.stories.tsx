import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoaderCircleIcon, MailIcon } from 'lucide-react';
import { Button } from '~/modules/ui/button';

/**
 * Displays a button or a component that looks like a button.
 */
const meta = {
  title: 'ui/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
    },
  },
  parameters: {
    layout: 'centered',
  },
  args: {
    variant: 'default',
    size: 'default',
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the button, used for primary actions and commands.
 */
export const Default: Story = {};

/**
 * Use the `outline` button to reduce emphasis on secondary actions, such as
 * canceling or dismissing a dialog.
 */
export const Outline: Story = {
  args: {
    variant: 'outline',
  },
};

/**
 * Use the `ghost` button is minimalistic and subtle, for less intrusive
 * actions.
 */
export const Ghost: Story = {
  args: {
    variant: 'ghost',
  },
};

/**
 * Use the `secondary` button to call for less emphasized actions, styled to
 * complement the primary button while being less conspicuous.
 */
export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

/**
 * Use the `destructive` button to indicate errors, alerts, or the need for
 * immediate attention.
 */
export const Destructive: Story = {
  args: {
    variant: 'destructive',
  },
};

/**
 * Use the `link` button to reduce emphasis on tertiary actions, such as
 * hyperlink or navigation, providing a text-only interactive element.
 */
export const Link: Story = {
  args: {
    variant: 'link',
  },
};

/**
 * Add the `disabled` prop to a button to prevent interactions and add a
 * loading indicator, such as a spinner, to signify an in-progress action.
 */
export const Loading: Story = {
  render: (args) => (
    <Button {...args}>
      <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
      Button
    </Button>
  ),
  args: {
    ...Outline.args,
    disabled: true,
  },
};

/**
 * Add an icon element to a button to enhance visual communication and
 * providing additional context for the action.
 */
export const WithIcon: Story = {
  render: (args) => (
    <Button {...args}>
      <MailIcon className="mr-2 size-4" /> Login with Email Button
    </Button>
  ),
  args: {
    ...Secondary.args,
  },
};

/**
 * Use the `sm` size for a smaller button, suitable for interfaces needing
 * compact elements without sacrificing usability.
 */
export const Small: Story = {
  args: {
    size: 'sm',
  },
};

/**
 * Use the `lg` size for a larger button, offering better visibility and
 * easier interaction for users.
 */
export const Large: Story = {
  args: {
    size: 'lg',
  },
};

/**
 * Use the "icon" size for a button with only an icon.
 */
export const Icon: Story = {
  args: {
    ...Secondary.args,
    size: 'icon',
    title: 'MailIcon',
    children: <MailIcon />,
  },
};

/**
 * Add the `disabled` prop to prevent interactions with the button.
 */
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

const BUTTON_VARIANTS = ['default', 'brand', 'destructive', 'success', 'warning', 'secondary'] as const;

/** Intent button variants in soft and solid fill, side by side, to catch soft labels losing the cascade. */
export const VariantMatrix: Story = {
  parameters: { controls: { disable: true }, layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-4">
      {([true, false] as const).map((soft) => (
        <div key={String(soft)} className="flex flex-col gap-2">
          <p className="font-medium text-muted-foreground text-xs uppercase">{soft ? 'soft' : 'solid'}</p>
          <div className="flex flex-wrap items-center gap-2">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} soft={soft} size="sm">
                {variant}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};
