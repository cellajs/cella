import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '~/modules/ui/carousel';

/**
 * A carousel with motion and swipe built using Embla.
 */
const meta: Meta<typeof Carousel> = {
  title: 'ui/Carousel',
  component: Carousel,
  tags: ['autodocs'],
  argTypes: {},
  args: {
    className: 'w-full max-w-xs',
  },
  render: (args) => (
    <Carousel {...args}>
      <CarouselContent>
        {Array.from({ length: 5 }).map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: testing purposes
          <CarouselItem key={index}>
            <div className="bg-card flex aspect-square items-center justify-center rounded border p-6">
              <span className="text-4xl font-semibold">{index + 1}</span>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Carousel>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default form of the carousel.
 */
export const Default: Story = {};

/**
 * Use the `basis` utility class to change the size of the carousel.
 */
export const Size: Story = {
  render: (args) => (
    <Carousel {...args} className="mx-12 w-full max-w-xs">
      <CarouselContent>
        {Array.from({ length: 5 }).map((_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: testing purposes
          <CarouselItem key={index} className="basis-1/3">
            <div className="bg-card flex aspect-square items-center justify-center rounded border p-6">
              <span className="text-4xl font-semibold">{index + 1}</span>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  ),
  args: {
    className: 'mx-12 w-full max-w-xs',
  },
};

export const ShouldNavigate: Story = {
  name: 'when clicking next/previous buttons, should navigate through slides',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvas, step }) => {
    const slides = await canvas.findAllByRole('group');
    expect(slides).toHaveLength(5);
    const nextBtn = await canvas.findByRole('button', { name: /next/i });
    const prevBtn = await canvas.findByRole('button', {
      name: /previous/i,
    });

    await step('navigate to the last slide', async () => {
      for (let i = 0; i < slides.length - 1; i++) {
        await userEvent.click(nextBtn);
      }
    });

    await step('navigate back to the first slide', async () => {
      for (let i = slides.length - 1; i > 0; i--) {
        await userEvent.click(prevBtn);
      }
    });
  },
};
//
