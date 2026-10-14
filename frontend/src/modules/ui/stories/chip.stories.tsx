import type { Meta, StoryObj } from '@storybook/react-vite';
import { TagIcon } from 'lucide-react';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { buttonVariants } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
import { cn } from '~/utils/cn';

const meta = { title: 'ui/Chip', component: Chip, tags: ['autodocs'], parameters: { layout: 'centered' } } satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = { args: { children: 'design' } };

export const Removable: Story = { args: { children: 'design', onRemove: () => {}, removeLabel: 'Remove design' } };

export const LongValue: Story = {
  args: { children: 'a-label-with-a-name-far-longer-than-its-field', onRemove: () => {}, removeLabel: 'Remove label' },
  decorators: [
    (Story) => (
      <div className="flex w-48">
        <Story />
      </div>
    ),
  ],
};

/**
 * A picker field that shows its chips: its trigger lies behind the chip row, which ignores the pointer, so a click on a
 * chip opens the picker while a remove button still takes its own click. No button sits inside another.
 */
function PickerField() {
  const [labels, setLabels] = useState(['design', 'backend', 'docs']);
  const [opened, setOpened] = useState(0);

  return (
    <div className="w-80">
      <div className={cn(buttonVariants({ variant: 'input', size: 'sm', press: false }), 'relative flex h-auto min-h-9 w-full justify-start py-1')}>
        <button type="button" aria-label="Labels" className="focus-effect absolute inset-0 rounded-md" onClick={() => setOpened(opened + 1)} />
        <div className="pointer-events-none relative flex flex-wrap items-center gap-1">
          {labels.length ? (
            labels.map((label) => (
              <Chip key={label} onRemove={() => setLabels(labels.filter((l) => l !== label))} removeLabel={`Remove ${label}`}>
                {label}
              </Chip>
            ))
          ) : (
            <TagIcon className="opacity-75" />
          )}
        </div>
      </div>
      <p className="mt-2 text-muted-foreground text-xs">opened: {opened}</p>
    </div>
  );
}

export const InPickerField: Story = {
  args: { children: '' },
  render: () => <PickerField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Remove backend' }));
    await expect(canvas.queryByText('backend')).not.toBeInTheDocument();
    await expect(canvas.getByText('opened: 0')).toBeVisible();

    // The chip ignores the pointer, so what lies under its text is the picker trigger
    const { x, y, width, height } = canvas.getByText('design').getBoundingClientRect();
    const hit = document.elementFromPoint(x + width / 2, y + height / 2) as HTMLElement;
    await expect(hit).toBe(canvas.getByRole('button', { name: 'Labels' }));
    await userEvent.click(hit);
    await expect(canvas.getByText('opened: 1')).toBeVisible();

    canvas.getByRole('button', { name: 'Remove docs' }).focus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.queryByText('docs')).not.toBeInTheDocument();
  },
};
