import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

enum NumberEvents {
  PLUS = 'plus',
  MINUS = 'minus',
}

export interface InputNumberProp extends React.InputHTMLAttributes<HTMLInputElement> {
  onValueChange: (value: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
}

const InputNumber = React.forwardRef<HTMLInputElement, InputNumberProp>(
  ({ className, min, max, step, value, onValueChange, disabled, ...props }, ref) => {
    // Handle increment and decrement events
    function handleNumberEvent(type: NumberEvents) {
      if (disabled) return;

      const direction = type === NumberEvents.PLUS ? 1 : -1;
      const current = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
      const stepValue = Number(step || 1);
      const next = Number((current + direction * stepValue).toFixed(2));

      if ((min != null && next < min) || (max != null && next > max)) return;

      onValueChange(next);
    }

    return (
      <div className={cn('relative flex w-full items-center', className)}>
        <input
          type="number"
          className="mr-2 flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-effect disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isNaN(parsed)) {
              onValueChange?.(parsed);
            }
          }}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          ref={ref}
          {...props}
        />
        <div className="absolute right-2 top-0">
          <Button
            variant="outline"
            type="button"
            aria-label="increment"
            size="icon"
            className="rounded-none"
            disabled={disabled}
            onClick={() => handleNumberEvent(NumberEvents.PLUS)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            type="button"
            size="icon"
            aria-label="decrement"
            className="rounded-l-none border-l-0"
            disabled={disabled}
            onClick={() => handleNumberEvent(NumberEvents.MINUS)}
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  },
);

InputNumber.displayName = 'InputNumber';

export { InputNumber };
