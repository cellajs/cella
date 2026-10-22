import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from '~/utils/cn';

export function Slider({ className, defaultValue, value, min = 0, max = 100, ...props }: SliderPrimitive.Root.Props) {
  const _values = Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max];

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none select-none items-center data-vertical:h-full data-vertical:min-h-44 data-vertical:w-auto data-vertical:flex-col data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Control data-slot="slider-control">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted data-horizontal:h-1.5 data-vertical:h-full data-horizontal:w-full data-vertical:w-1.5"
        >
          <SliderPrimitive.Indicator data-slot="slider-range" className="absolute bg-primary data-horizontal:h-full data-vertical:w-full" />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            // biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs are positional and never reordered.
            key={index}
            className="focus-effect block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 hover:ring-ring/30 data-disabled:pointer-events-none data-disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
