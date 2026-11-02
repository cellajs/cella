import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from '~/modules/common/logo';
import { LogoMark, LogoText } from '~/modules/common/logo-art';

const meta = { title: 'common/Logo', component: Logo, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const Large: Story = { args: { size: 'lg' } };

export const ExtraLarge: Story = { args: { size: 'xl' } };

export const CustomColors: Story = { args: { iconColor: '#FF6B00', textColor: '#1a1a1a' } };

/** The art's boxes outlined: the mark touches its square box on its long side, and the text its box left and right. */
export const ArtBoxes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <LogoMark className="size-24 outline outline-primary" />
      <LogoText className="h-24 w-auto outline outline-primary" />
    </div>
  ),
};
