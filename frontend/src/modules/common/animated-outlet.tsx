import { Outlet } from '@tanstack/react-router';
import { forwardRef } from 'react';
import { motion } from 'framer-motion';

const transitionProps = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

export const AnimatedOutlet = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <motion.div ref={ref} {...transitionProps}>
      <Outlet />
    </motion.div>
  );
});
