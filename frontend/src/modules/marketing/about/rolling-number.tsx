import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const faces = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const durationSeconds = 1.4;
const staggerSeconds = 0.2;

interface RollingDigitProps {
  digit: number;
  delay: number;
}

function RollingDigit({ digit, delay }: RollingDigitProps) {
  return (
    // Faces are 1.5em apart: the edge fade stays clear of the resting digit and no neighbor shows through it.
    <span aria-hidden="true" className="-my-[0.25em] h-[1.5em] overflow-hidden mask-y-from-83% tabular-nums select-none">
      <motion.span
        className="block"
        initial={{ y: '0%' }}
        animate={{ y: `${digit * -10}%` }}
        transition={{ type: 'spring', duration: durationSeconds, bounce: 0, delay }}
      >
        {faces.map((face) => (
          <span key={face} className="block py-[0.25em] leading-none">
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

interface RollingNumberProps {
  value: number;
  /** While false, each digit waits at half its value; with reduced motion it never waits. */
  roll: boolean;
}

/**
 * A whole number in the locale's format, for a flex parent: each digit rolls once to its value, a beat after the character on its left.
 * A digit that appears when the value grows rolls up from 0.
 */
export function RollingNumber({ value, roll }: RollingNumberProps) {
  const reduceMotion = useReducedMotion();
  const formatted = value.toLocaleString();
  const chars = [...formatted];

  return (
    <>
      <span className="sr-only">{formatted}</span>
      {/* Keys count places from the right: a column keeps its place when digits appear on the left. */}
      <AnimatePresence initial={false}>
        {chars.map((char, index) => {
          const place = chars.length - index;
          if (!/\d/.test(char)) {
            return (
              <span key={place} aria-hidden="true" className="leading-none">
                {char}
              </span>
            );
          }
          const digit = Number(char);
          return <RollingDigit key={place} digit={roll || reduceMotion ? digit : Math.floor(digit / 2)} delay={index * staggerSeconds} />;
        })}
      </AnimatePresence>
    </>
  );
}
