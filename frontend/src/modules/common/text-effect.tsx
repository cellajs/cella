import { motion } from 'motion/react';
import { cn } from '~/utils/cn';

type TextEffectProps = { text: string; className?: string };

export function TextEffect({ text, className = '' }: TextEffectProps) {
  const variants = {
    hidden: { opacity: 0 },
    show: (i: number) => ({ y: 0, opacity: 1, transition: { delay: i * 0.02 } }),
  };

  const letters = text.split('');

  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={variants} className={cn('', className)}>
      {letters.map((word, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
        <motion.span key={`${word}-${i}`} variants={variants} custom={i}>
          {word}
        </motion.span>
      ))}
    </motion.div>
  );
}
