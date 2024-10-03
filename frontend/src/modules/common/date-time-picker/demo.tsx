'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { Calendar as CalendarIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TimePicker } from '~/modules/common/date-time-picker/time-picker';
import { Button } from '~/modules/ui/button';
import { Calendar } from '~/modules/ui/calendar';
import { FormControl, FormField, FormItem, FormLabel } from '~/modules/ui/form';
import { Form } from '~/modules/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

const formSchema = z.object({
  dateTime: z.date(),
});

type FormSchemaType = z.infer<typeof formSchema>;

export function DateTimePickerForm() {
  const form = useForm<FormSchemaType>({
    resolver: zodResolver(formSchema),
  });

  function onSubmit(data: FormSchemaType) {
    console.log('You submitted the following values:', JSON.stringify(data, null, 2));
  }

  return (
    <Form {...form}>
      <form className="flex items-end gap-4 justify-center" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="dateTime"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="text-left">DateTime</FormLabel>
              <Popover>
                <FormControl>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-72 justify-start text-left font-normal', !field.value && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {field.value ? dayjs(field.value).format('LLL HH:mm:ss') : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                </FormControl>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                  <div className="p-3 border-t border-border">
                    <TimePicker setDate={field.onChange} date={field.value} />
                  </div>
                </PopoverContent>
              </Popover>
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
