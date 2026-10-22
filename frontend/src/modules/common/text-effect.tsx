import { motion } from 'motion/react';

interface TextEffectProps {
  text: string;
  className?: string;
}

export function TextEffect({ text, className }: TextEffectProps) {
  const variants = {
    hidden: { opacity: 0 },
    show: (index: number) => ({ y: 0, opacity: 1, transition: { delay: index * 0.02 } }),
  };

  const letters = text.split('');

  return (
    <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={variants} className={className}>
      {letters.map((letter, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
        <motion.span key={`${letter}-${index}`} variants={variants} custom={index}>
          {letter}
        </motion.span>
      ))}
    </motion.div>
  );
}
