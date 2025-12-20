import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Calendar } from '~/modules/ui/calendar';

/**
 * A date picker component built on react-day-picker with customizable styling and behavior.
 */
const meta = {
  title: 'ui/Calendar',
  component: Calendar,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    showOutsideDays: {
      control: 'boolean',
    },
    captionLayout: {
      control: 'select',
      options: ['label', 'dropdown'],
    },
    buttonVariant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    disabled: {
      control: 'boolean',
    },
    numberOfMonths: {
      control: 'number',
      min: 1,
      max: 3,
    },
  },
  args: {
    showOutsideDays: true,
    captionLayout: 'label',
    buttonVariant: 'ghost',
    disabled: false,
    numberOfMonths: 1,
  },
} satisfies Meta<typeof Calendar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default single date selection calendar.
 */
export const Default: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Calendar with dropdown month/year selection.
 */
export const WithDropdowns: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        captionLayout="dropdown"
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Calendar with disabled dates (past dates disabled).
 */
export const WithDisabledDates: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const disabled = { before: new Date() };

    return (
      <Calendar
        {...args}
        mode="single"
        disabled={disabled}
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Calendar with hidden outside days.
 */
export const HiddenOutsideDays: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        showOutsideDays={false}
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Multiple months view for extended date selection.
 */
export const MultipleMonths: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        numberOfMonths={2}
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Calendar with different button variants.
 */
export const DifferentButtonVariants: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());

    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Default buttons</h3>
          <Calendar
            {...args}
            mode="single"
            buttonVariant="default"
            selected={date}
            onSelect={(selectedDate) => setDate(selectedDate)}
            className="rounded-md border"
          />
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Outline buttons</h3>
          <Calendar
            {...args}
            mode="single"
            buttonVariant="outline"
            selected={date}
            onSelect={(selectedDate) => setDate(selectedDate)}
            className="rounded-md border"
          />
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Secondary buttons</h3>
          <Calendar
            {...args}
            mode="single"
            buttonVariant="secondary"
            selected={date}
            onSelect={(selectedDate) => setDate(selectedDate)}
            className="rounded-md border"
          />
        </div>
      </div>
    );
  },
};

/**
 * Calendar with week numbers.
 */
export const WithWeekNumbers: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        showWeekNumber
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Calendar with fixed week starts.
 */
export const FixedWeeks: Story = {
  render: (args) => {
    const [date, setDate] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        fixedWeeks
        selected={date}
        onSelect={(selectedDate) => setDate(selectedDate)}
        className="rounded-md border"
      />
    );
  },
};

/**
 * Disabled calendar state.
 */
export const Disabled: Story = {
  render: (args) => {
    const [date] = useState<Date | undefined>(new Date());
    return (
      <Calendar
        {...args}
        mode="single"
        disabled
        selected={date}
        onSelect={() => {}}
        className="rounded-md border opacity-50"
      />
    );
  },
};
