import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { EntityChip } from '~/modules/common/entity-chip';

const meta = { title: 'common/EntityChip', component: EntityChip, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<
  typeof EntityChip
>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Organization: Story = {
  args: { type: 'organization', id: '2', name: 'Acme Corp' },
  play: async ({ canvasElement }) => {
    const chip = canvasElement.querySelector('[data-slot="chip"]')?.getBoundingClientRect();
    const avatar = canvasElement.querySelector('[data-slot="avatar"]')?.getBoundingClientRect();

    await expect(chip).toBeDefined();
    // The avatar covers the chip's start edge and border
    await expect(avatar?.left).toBe(chip?.left);
    await expect(avatar?.top).toBe(chip?.top);
    await expect(avatar?.height).toBe(chip?.height);
  },
};

export const User: Story = { args: { type: 'user', id: '1', name: 'Alice Smith' } };

export const WithImage: Story = { args: { type: 'user', id: '1', name: 'Alice', url: 'https://i.pravatar.cc/150?u=alice' } };

export const WithCount: Story = {
  args: {
    type: 'organization',
    id: '2',
    name: 'Acme Corporation International',
    className: 'max-w-48 bg-background text-xs',
    end: <span className="text-muted-foreground tabular-nums">128</span>,
  },
};

export const Removable: Story = {
  args: { type: 'user', id: '1', name: 'Alice Smith', onRemove: fn(), removeLabel: 'Remove Alice Smith' },
  play: async ({ args, canvasElement }) => {
    // The avatar repeats the name, so the chip's text is the only name read out
    await expect(canvasElement.querySelector('[data-slot="avatar"]')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Remove Alice Smith' }));
    await expect(args.onRemove).toHaveBeenCalledOnce();
  },
};

export const Large: Story = {
  args: {
    type: 'organization',
    id: '2',
    name: 'Acme Corp',
    size: 'lg',
    className: 'border-primary/20 bg-primary/5 pr-3',
    children: 'Invitation to Acme Corp',
  },
};
