'use client';

import { Calendar as CalendarIcon } from 'lucide-react';
import * as React from 'react';

import dayjs from 'dayjs';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { Calendar } from '~/modules/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { TimePicker } from './time-picker';

export function DateTimePicker() {
  const [date, setDate] = React.useState<Date>();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={'outline'} className={cn('w-[280px] justify-start text-left font-normal', !date && 'text-muted-foreground')}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? dayjs(date).format('PPP HH:mm:ss') : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
        <div className="p-3 border-t border-border">
          <TimePicker setDate={setDate} date={date} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
