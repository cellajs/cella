import { SearchIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Spinner } from '~/modules/common/spinner';
import { cn } from '~/utils/cn';

interface SearchSpinnerProps {
  isSearching: boolean;
  value: string;
  /** Seconds before the spinner fades in (default 0.3, so a fast response shows no flicker); 0 shows it at once. */
  appearDelay?: number;
}

export function SearchSpinner({ isSearching, value, appearDelay = 0.3 }: SearchSpinnerProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSearching ? (
        <motion.div
          key="spinner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: appearDelay } }}
          exit={{ opacity: 0, transition: { delay: 0 } }}
        >
          <Spinner size="sm" className="mr-2 h-auto group-[.text-lg]/search-input:size-5" noDelay />
        </motion.div>
      ) : (
        <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <SearchIcon className={cn('mr-2 size-4 h-auto group-[.text-lg]/search-input:size-5', !value && 'opacity-50')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
