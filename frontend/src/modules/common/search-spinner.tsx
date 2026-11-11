import { SearchIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { fadeMotion } from '~/modules/common/motion-presets';
import { Spinner, spinnerDelayMs } from '~/modules/common/spinner';
import { cn } from '~/utils/cn';

const spinnerDelaySeconds = spinnerDelayMs / 1000;

interface SearchSpinnerProps {
  isSearching: boolean;
  hasSearch: boolean;
  /** Seconds before the spinner fades in. */
  appearDelay?: number;
}

export function SearchSpinner({ isSearching, hasSearch, appearDelay = spinnerDelaySeconds }: SearchSpinnerProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSearching ? (
        <motion.div key="spinner" {...fadeMotion} animate={{ opacity: 1, transition: { ...fadeMotion.transition, delay: appearDelay } }}>
          <Spinner size="sm" className="mr-2 h-auto group-[.text-lg]/search-input:size-5" noDelay />
        </motion.div>
      ) : (
        <motion.div key="search" {...fadeMotion}>
          <SearchIcon className={cn('mr-2 size-4 h-auto group-[.text-lg]/search-input:size-5', !hasSearch && 'opacity-50')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
