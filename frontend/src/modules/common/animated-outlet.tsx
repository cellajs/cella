import { Outlet } from '@tanstack/react-router';
import { forwardRef } from 'react';
import { motion } from 'framer-motion';

// TODO: motion is not working great due to tanstack router not keeping the old route in the DOM
const transitionProps = {
  // initial: { opacity: 0, y: 20 },
  // animate: { opacity: 1, y: 0 },
  // transition: { duration: 0.5 },
};

export const AnimatedOutlet = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <motion.div ref={ref} {...transitionProps}>
      <Outlet />
    </motion.div>
  );
});
