import { AnimatePresence, motion } from 'motion/react';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { type InternalSheet, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '~/modules/ui/drawer';

const sideToSwipeDirection = { top: 'up', bottom: 'down', left: 'left', right: 'right' } as const;

export const SheeterDrawer = ({ sheet }: { sheet: InternalSheet }) => {
  // Drawers on mobile are always modal (overlay + outside click to close)
  const { id, side, description, title, titleContent = title, className, content, contentKey, open = true } = sheet;

  const updateSheet = sheeter.getState().update;

  // Check if dropdown is open, then disable dismissible
  const isDropdownOpen = useDropdowner((state) => state.dropdown);

  // onClose trigger handles by remove method
  const closeSheet = () => sheeter.getState().remove(sheet.id);

  const onOpenChange = (open: boolean) => {
    updateSheet(sheet.id, { open });
    if (!open) closeSheet();
  };

  return (
    <Drawer
      key={id}
      modal
      open={open}
      disablePointerDismissal={!!isDropdownOpen}
      swipeDirection={sideToSwipeDirection[side]}
      onOpenChange={onOpenChange}
    >
      <DrawerContent id={String(id)} className={className}>
        <DrawerHeader sticky className={`${description || title ? '' : 'hidden'}`}>
          <DrawerTitle className={`font-medium ${title ? '' : 'hidden'}`}>{titleContent}</DrawerTitle>
          <DrawerDescription className={`text-muted-foreground font-light ${description ? '' : 'hidden'}`}>
            {description}
          </DrawerDescription>
        </DrawerHeader>
        {contentKey ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={contentKey}
              className="flex flex-col flex-1"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.15 }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        ) : (
          content
        )}
      </DrawerContent>
    </Drawer>
  );
};
