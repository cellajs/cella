import { TextAlignButton, useComponentsContext } from '@blocknote/react';
import { ChevronDown, MoveHorizontal } from 'lucide-react';
import { customTextAlignItems } from '~/modules/common/blocknote/blocknote-config';

export const CustomTextAlignSelect = () => {
  // biome-ignore lint/style/noNonNullAssertion: required by author
  const Components = useComponentsContext()!;

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button className="bn-dropdown-button" label="Text align select" mainTooltip="Select text align">
          <MoveHorizontal size={20} />
          <ChevronDown size={14} />
        </Components.FormattingToolbar.Button>
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown>
        <Components.Generic.Menu.Item className="no-hover-bg">
          {customTextAlignItems.map((el) => (
            <TextAlignButton textAlignment={el} key={`textAlign${el.charAt(0).toUpperCase() + el.slice(1)}Button`} />
          ))}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
};
