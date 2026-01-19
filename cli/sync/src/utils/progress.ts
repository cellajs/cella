/**
 * Progress Tracker Utility
 *
 * Provides compact progress tracking for CLI operations.
 * - Normal mode: Single line with spinner that updates in place
 * - Debug mode: Tree-style list showing all completed steps
 */

import pc from 'picocolors';
import yoctoSpinner, { type Spinner } from 'yocto-spinner';
import { config } from '../config';

/** Global reference to the currently active spinner for pausing during prompts */
let activeSpinner: Spinner | null = null;

/**
 * Pause the active spinner to allow interactive prompts.
 * Call resume() when the prompt is complete.
 */
export function pauseSpinner(): void {
  if (activeSpinner && !config.isVerbose) {
    activeSpinner.stop();
  }
}

/**
 * Resume the active spinner after an interactive prompt.
 */
export function resumeSpinner(): void {
  if (activeSpinner && !config.isVerbose) {
    activeSpinner.start();
  }
}

export interface ProgressTracker {
  /** Update the current step (shown as spinner text or logged in debug) */
  step: (message: string) => void;
  /** Mark the tracker as complete with final message */
  done: (message: string) => void;
  /** Mark the tracker as failed with error message and stop spinner */
  fail: (message: string) => void;
  /** Wrap an async operation to auto-fail on error */
  wrap: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Creates a progress tracker for a multi-step operation.
 *
 * Behavior by mode:
 * - Normal: Single spinner that updates in place
 * - Verbose/Debug: Tree-style log showing header and all steps
 *
 * @param title - The title/header for this operation
 * @returns A ProgressTracker instance
 *
 * @example
 * const progress = createProgress('analyzing files');
 * progress.step('fetching file list');
 * progress.step('comparing histories');
 * progress.done('analysis complete');
 */
export function createProgress(title: string): ProgressTracker {
  const completedSteps: string[] = [];
  const spinner = yoctoSpinner({ text: title });

  // In verbose/debug mode, show the title header; otherwise use spinner
  if (config.isVerbose) {
    console.info(pc.cyan(`\n${title}`));
  } else {
    activeSpinner = spinner;
    spinner.start();
  }

  return {
    step: (message: string) => {
      if (config.isVerbose) {
        // Verbose/Debug mode: log each step with tree styling
        console.info(pc.gray(`  ├─ ${message}`));
      } else {
        // Normal mode: update spinner text
        spinner.text = message;
      }
      completedSteps.push(message);
    },

    done: (message: string) => {
      if (config.isVerbose) {
        // Verbose/Debug mode: show final step with tree end
        console.info(`  └─ ${pc.green('✓')} ${message}`);
      } else {
        // Normal mode: stop spinner and show success
        spinner.stop();
        activeSpinner = null;
        if (message) console.info(`${pc.green('✓')} ${message}`);
        else console.info();
      }
    },

    fail: (message: string) => {
      if (config.isVerbose) {
        console.info(pc.red(`  └─ ✗ ${message}`));
      } else {
        spinner.stop();
        activeSpinner = null;
        console.info(`${pc.red('✗')} ${pc.red(message)}`);
      }
    },

    wrap: async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (config.isVerbose) {
          console.info(pc.red(`  └─ ✗ ${errorMessage}`));
        } else {
          // Stop spinner and show tree-style breakdown on failure
          spinner.stop();
          activeSpinner = null;
          console.info(pc.cyan(`\n${title}`));
          for (const step of completedSteps) {
            console.info(pc.gray(`  ├─ ${step}`));
          }
          console.info(pc.red(`  └─ ✗ ${errorMessage}`));
        }
        throw error;
      }
    },
  };
}
