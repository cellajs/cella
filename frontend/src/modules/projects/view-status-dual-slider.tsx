import { useEffect, useState, forwardRef } from 'react';
import { Slider, SliderThumb, SliderTrack, SliderRange } from '@radix-ui/react-slider';
import { cn } from '~/lib/utils';
import { cva } from 'class-variance-authority';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';

type TaskStatuses = 'iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted' | null | undefined;
export type SliderProps = {
  className?: string;
  min: number;
  max: number;
  minStepsBetweenThumbs?: number;
  step: number;
  formatLabel?: (value: number) => string;
  value?: number[] | readonly number[];
  onValueChange?: (values: number[]) => void;
};

const variants = cva('border-1', {
  variants: {
    status: {
      iced: 'border-sky-500/60',
      unstarted: 'border-slate-300/60',
      started: 'border-slate-500/60',
      finished: 'border-lime-500/60 ',
      delivered: 'border-yellow-500/60 ',
      reviewed: 'border-orange-500/60',
      accepted: 'border-green-500/60',
    },
  },
});

const Thumb = ({ value, lastEl }: { value: string | number; lastEl?: boolean }) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    (event.currentTarget as HTMLDivElement).focus();
  };

  return (
    <SliderThumb
      className="relative z-10 block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      aria-label="Volume"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <div
        className={`absolute -top-8 text-sm ${
          lastEl ? 'right-1/4' : 'left-1/2'
        } transform z-30 rounded-md border bg-popover text-popover-foreground shadow-sm px-2 ${isHovered ? 'block' : 'hidden'} ${variants({
          status: value as TaskStatuses,
        })}`}
      >
        {value ? t(`common:${value}`) : t('common:unselected')}
      </div>
    </SliderThumb>
  );
};

export const DualSlider = forwardRef<HTMLDivElement, SliderProps>(
  ({ className, min, max, step, formatLabel, value, onValueChange, ...props }, ref) => {
    const { t } = useTranslation();
    const initialValue = Array.isArray(value) ? value : [min, max];
    const [localValues, setLocalValues] = useState<number[]>(initialValue);

    const handleValueChange = (newValues: number[]) => {
      setLocalValues(newValues);
      if (onValueChange) onValueChange(newValues);
    };

    useEffect(() => {
      // Update localValues when the external value prop changes
      setLocalValues(Array.isArray(value) ? value : [min, max]);
    }, [min, max, value]);
    return (
      <div className="inline-flex align-center gap-2">
        <Slider
          ref={ref}
          min={min}
          max={max}
          step={step}
          value={localValues}
          onValueChange={handleValueChange}
          className={cn('relative flex w-full touch-none select-none items-center', className)}
          {...props}
        >
          <SliderTrack className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
            <SliderRange className="absolute h-full bg-primary" />
          </SliderTrack>
          <Thumb value={formatLabel ? formatLabel(localValues[0]) : localValues[0]} />
          <Thumb value={formatLabel ? formatLabel(localValues[1]) : localValues[1]} lastEl={localValues[1] === max} />
        </Slider>
        <Button variant={'outlineGhost'} size={'micro'} onClick={() => handleValueChange([0, 0])}>
          {t('common:clear_all')}
        </Button>
      </div>
    );
  },
);
