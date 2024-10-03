import type { SheetProp } from '~/modules/common/sheeter/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

export default function MobileSheet({ id, side = 'right', title, description, modal = true, content, className, removeSheet }: SheetProp) {
  return (
    <Drawer modal={modal} open={true} onClose={removeSheet} direction={side} noBodyStyles>
      <DrawerContent
        onInteractOutside={(e) => {
          // to prevent reopen on menu nav click
          const target = e.target as HTMLElement;
          //to prevent close after dropdownselect
          if (!target || target.dataset.state === 'closed') return;
          if (modal) return removeSheet();

          // Find the button element based on its id or any child element
          const button = document.getElementById(id);
          // Check if the click event target is the button itself or any of its children
          if (button && (button === target || button.contains(target))) return;
          removeSheet();
        }}
        direction={side}
        className={className}
      >
        <DrawerHeader className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium mb-2 ${title ? '' : 'hidden'}`}>{title}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light pb-4${description ? '' : 'hidden'}`}>{description}</DrawerDescription>
        </DrawerHeader>
        {content}
      </DrawerContent>
    </Drawer>
  );
}
