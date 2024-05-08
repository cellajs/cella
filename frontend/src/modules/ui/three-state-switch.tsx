import type { LucideProps } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

type Value = { id: number; value: string; label: string; Icon?: React.ElementType<LucideProps> };
type SwitchValues = [Value, Value, Value];

type ThreeStateSwitchProps = {
  value?: string;
  switchValues: SwitchValues;
  showWithLabel?: boolean;
  disableIndex?: (0 | 1 | 2)[];
  onChange?: (newValue: string) => void;
};

const ThreeStateSwitch = ({ switchValues, value = switchValues[0].value, onChange, showWithLabel, disableIndex = [] }: ThreeStateSwitchProps) => {
  const handleStateChange = (newState: string) => {
    if (!newState.length || newState === value) return;
    onChange?.(newState);
  };

  return (
    <ToggleGroup type="single" value={value} onValueChange={handleStateChange} className="max-sm:hidden" aria-label="Alignment">
      {switchValues.map((item, index) => (
        <ToggleGroupItem key={item.value} value={item.value} aria-label={item.label} disabled={disableIndex.includes(index as 0 | 1 | 2)}>
          {showWithLabel && item.Icon ? (
            <div className="inline-flex align-center gap-2">
              <item.Icon />
              <span>{item.label}</span>
            </div>
          ) : (
            <>{item.Icon ? <item.Icon /> : <span>{item.label}</span>}</>
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
};

export default ThreeStateSwitch;
