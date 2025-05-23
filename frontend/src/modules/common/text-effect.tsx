import { motion, useInView } from 'motion/react';
import { useRef } from 'react';
import { cn } from '~/utils/cn';

type TextEffectProps = {
  text: string;
  className?: string;
};

export const TextEffect = ({ text, className = '' }: TextEffectProps) => {
  const variants = {
    hidden: { opacity: 0 },
    show: (i: number) => ({
      y: 0,
      opacity: 1,
      transition: { delay: i * 0.02 },
    }),
  };

  const letters = text.split('');
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'show' : ''}
      variants={variants}
      viewport={{ once: true }}
      className={cn('text-xl text-center font-medium sm:text-4xl md:text-5xl md:leading-[4rem]', className)}
    >
      {letters.map((word, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
        <motion.span key={`${word}-${i}`} variants={variants} custom={i}>
          {word}
        </motion.span>
      ))}
    </motion.div>
  );
};
