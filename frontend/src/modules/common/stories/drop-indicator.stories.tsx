import type { Meta, StoryObj } from '@storybook/react-vite';
import { DropIndicator } from '~/modules/common/drop-indicator';

const meta = {
  title: 'common/DropIndicator',
  component: DropIndicator,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DropIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="relative flex h-24 w-48 items-center justify-center rounded-md border border-muted-foreground/30 border-dashed text-muted-foreground text-sm">
    Drop target
    {children}
  </div>
);

export const Top: Story = {
  args: { edge: 'top', gap: 0 },
  render: (args) => (
    <Container>
      <DropIndicator {...args} />
    </Container>
  ),
};

export const Bottom: Story = {
  args: { edge: 'bottom', gap: 0 },
  render: (args) => (
    <Container>
      <DropIndicator {...args} />
    </Container>
  ),
};

export const Left: Story = {
  args: { edge: 'left', gap: 0 },
  render: (args) => (
    <Container>
      <DropIndicator {...args} />
    </Container>
  ),
};

export const Right: Story = {
  args: { edge: 'right', gap: 0 },
  render: (args) => (
    <Container>
      <DropIndicator {...args} />
    </Container>
  ),
};

export const WithGap: Story = {
  args: { edge: 'top', gap: 0.5 },
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Container>
        <DropIndicator {...args} />
      </Container>
      <Container>content below</Container>
    </div>
  ),
};

export const AllEdges: Story = {
  args: { edge: 'top', gap: 0 },
  render: () => (
    <div className="grid grid-cols-2 gap-8">
      <Container>
        <DropIndicator edge="top" gap={0} />
      </Container>
      <Container>
        <DropIndicator edge="bottom" gap={0} />
      </Container>
      <Container>
        <DropIndicator edge="left" gap={0} />
      </Container>
      <Container>
        <DropIndicator edge="right" gap={0} />
      </Container>
    </div>
  ),
};
