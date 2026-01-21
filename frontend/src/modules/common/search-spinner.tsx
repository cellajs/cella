import { SearchIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Spinner from '~/modules/common/spinner';

/**
 * Toggles between a spinner and search icon based on search state.
 */
export function SearchSpinner({ isSearching, value }: { isSearching: boolean; value: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {isSearching ? (
        <motion.div
          key="spinner"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { delay: 0.3 } }} // appear with delay
          exit={{ opacity: 0, transition: { delay: 0 } }} // disappear immediately
        >
          <Spinner className="size-4 mr-2 group-[.text-lg]:size-5 h-auto shrink-0" noDelay />
        </motion.div>
      ) : (
        <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <SearchIcon
            className="size-4 mr-2 group-[.text-lg]:size-5 h-auto shrink-0"
            style={{ opacity: value ? 1 : 0.5 }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
