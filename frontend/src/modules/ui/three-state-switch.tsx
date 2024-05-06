import type { LucideProps } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

type Value = { id: number; value: string; label: string; Icon?: React.ElementType<LucideProps> };
type SwitchValues = [Value, Value, Value];

type ThreeStateSwitchProps = {
  defaultValue?: string;
  switchValues: SwitchValues;
  showWithLabel?: boolean;
  onChange?: (newValue: string) => void;
};

const ThreeStateSwitch = ({ switchValues, defaultValue = switchValues[0].value, onChange, showWithLabel }: ThreeStateSwitchProps) => {
  const handleStateChange = (newState: string) => {
    if (!newState.length || newState === defaultValue) return;
    onChange?.(newState);
  };

  return (
    <ToggleGroup type="single" value={defaultValue} onValueChange={handleStateChange} className="max-sm:hidden" aria-label="Alignment">
      {switchValues.map((item) => (
        <ToggleGroupItem value={item.value} aria-label={item.label}>
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
