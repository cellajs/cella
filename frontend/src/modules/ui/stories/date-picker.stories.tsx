import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { action } from 'storybook/actions';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { Button } from '~/modules/ui/button';
import { Calendar } from '~/modules/ui/calendar';
import { Input } from '~/modules/ui/input';
import { Label } from '~/modules/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';

/**
 * A window overlaid on either the primary window or another dialog window,
 * rendering the content underneath inert.
 */
const meta = {
  title: 'ui/DatePicker',
  component: Calendar,
  tags: ['autodocs'],
  argTypes: {},
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Combination of the calendar and a button that opens a popover.
 */
export const WithPopover: Story = {
  args: {
    captionLayout: 'dropdown',
  },

  render: (args) => {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState<Date | undefined>(undefined);
    return (
      <div className="flex flex-col gap-3">
        <Label htmlFor="date" className="px-1">
          Date of birth
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" id="date" className="w-48 justify-between font-normal">
              {date ? date.toLocaleDateString() : 'Select date'}
              <ChevronDownIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="start">
            <Calendar
              {...args}
              mode="single"
              selected={date}
              onSelect={(date) => {
                setDate(date);
                setOpen(false);
                action('date selected')(date);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
    );
  },
};

export const ShouldOpenPopover: Story = {
  ...WithPopover,
  name: 'when clicking the button, should open the popover to select a date',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await step('Open the popover', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: 'Date of birth' }));
      await waitFor(() => expect(canvasElement.ownerDocument.body.querySelector('.rdp-root')).toBeVisible());
    });
    await step('Select a date', async () => {
      const dateButtons = await canvas.findAllByRole('button', {
        name: /1st/i,
      });
      await userEvent.click(dateButtons[0]);
    });
  },
};

function formatDate(date: Date | undefined) {
  return date
    ? date.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    : '';
}

function isValidDate(date: Date | undefined) {
  return date ? !Number.isNaN(date.getTime()) : false;
}

/**
 * Combination of the calendar and an input field that allows typing a date.
 */
export const WithInput: Story = {
  args: {
    captionLayout: 'dropdown',
  },

  render: (args) => {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState<Date | undefined>(new Date('2025-06-01'));
    const [month, setMonth] = useState<Date | undefined>(date);
    const [value, setValue] = useState(formatDate(date));

    return (
      <div className="flex flex-col gap-3">
        <Label htmlFor="date" className="px-1">
          Subscription Date
        </Label>
        <div className="relative flex gap-2">
          <Input
            id="date"
            value={value}
            placeholder="June 01, 2025"
            className="bg-background pr-10"
            onChange={(e) => {
              const date = new Date(e.target.value);
              setValue(e.target.value);
              if (isValidDate(date)) {
                setDate(date);
                setMonth(date);
                action('date input changed')(date);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setOpen(true);
              }
            }}
          />
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button id="date-picker" variant="ghost" className="absolute top-1/2 right-2 size-6 -translate-y-1/2">
                <CalendarIcon className="size-3.5" />
                <span className="sr-only">Select date</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
              <Calendar
                {...args}
                mode="single"
                selected={date}
                month={month}
                onMonthChange={setMonth}
                onSelect={(date) => {
                  setDate(date);
                  setValue(formatDate(date));
                  setOpen(false);
                  action('date selected')(date);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    );
  },
};

export const ShouldEnterTextDate: Story = {
  ...WithInput,
  name: 'when typing a valid date, should update the input and close the calendar',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const input = await canvas.findByRole('textbox', {
      name: 'Subscription Date',
    });
    await step('type a date', async () => {
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, 'July 21, 1999');
      await userEvent.keyboard('{enter}');
      expect(input).toHaveValue('July 21, 1999');
    });

    await step('check the calendar', async () => {
      await userEvent.click(await canvas.findByRole('button', { name: 'Select date' }));
      await waitFor(() =>
        expect(
          canvas.queryByRole('button', {
            name: 'Wednesday, July 21st, 1999, selected',
          }),
        ).toBeVisible(),
      );
    });
  },
};

/**
 * Combination of the calendar and an input field that allows changing the time.
 */
export const WithDateTime: Story = {
  args: {
    captionLayout: 'dropdown',
  },

  render: (args) => {
    const [open, setOpen] = useState(false);
    const [date, setDate] = useState<Date | undefined>(undefined);
    return (
      <div className="flex gap-4">
        <div className="flex flex-col gap-3">
          <Label htmlFor="date-picker" className="px-1">
            Date
          </Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" id="date-picker" className="w-32 justify-between font-normal">
                {date ? date.toLocaleDateString() : 'Select date'}
                <ChevronDownIcon />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto overflow-hidden p-0" align="start">
              <Calendar
                {...args}
                mode="single"
                selected={date}
                onSelect={(date) => {
                  setDate(date);
                  setOpen(false);
                  action('date selected')(date);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-col gap-3">
          <Label htmlFor="time-picker" className="px-1">
            Time
          </Label>
          <Input
            type="time"
            id="time-picker"
            step="1"
            disabled={!date}
            defaultValue="10:30:00"
            onChange={(e) => {
              if (!date) {
                return;
              }
              const [hours, minutes, seconds] = e.target.value.split(':').map(Number);
              date.setHours(hours, minutes, seconds);
              setDate(date);
              action('time selected')(date);
            }}
            className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
        </div>
      </div>
    );
  },
};

export const ShouldOpenCalendar: Story = {
  ...WithDateTime,
  name: 'when clicking the date button, should open the calendar to select a date',
  tags: ['!dev', '!autodocs'],
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement.ownerDocument.body);

    await step('Open the date popover', async () => {
      const dateInput = await canvas.findByLabelText('Date');
      await userEvent.click(dateInput);
      await waitFor(() => expect(canvas.queryAllByRole('button', { name: /1st/i }).at(0)).toBeVisible());
    });

    const dateButtons = await canvas.findAllByRole('button', { name: /1st/i });
    await userEvent.click(dateButtons[0]);

    await step('type a time', async () => {
      const timeInput = await canvas.findByLabelText('Time');
      await userEvent.click(timeInput);
      await userEvent.type(timeInput, '1');
    });
  },
};
