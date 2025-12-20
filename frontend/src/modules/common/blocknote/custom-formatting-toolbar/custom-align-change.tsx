import { TextAlignButton, useComponentsContext } from '@blocknote/react';
import { ChevronDownIcon, MoveHorizontalIcon } from 'lucide-react';

// Infer BasicTextAlign type directly from component prop
type BasicTextAlign = React.ComponentProps<typeof TextAlignButton>['textAlignment'];

export const CustomTextAlignSelect = () => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;

  const variants = ['left', 'center', 'right', 'justify'] satisfies BasicTextAlign[];

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-dropdown-button"
          label="Text align select"
          mainTooltip="Select text align"
        >
          <MoveHorizontalIcon size={20} />
          <ChevronDownIcon size={14} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown>
        <Components.Generic.Menu.Item className="no-hover-bg">
          {variants.map((el) => (
            <TextAlignButton textAlignment={el} key={`textAlign${el.charAt(0).toUpperCase() + el.slice(1)}Button`} />
          ))}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
