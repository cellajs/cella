/**
 * Progress Tracker Utility
 *
 * Provides compact progress tracking for CLI operations.
 * Uses a single spinner that updates in place.
 */

import ora, { type Ora } from 'ora';
import pc from 'picocolors';

/** Global reference to the currently active spinner */
let activeSpinner: Ora | null = null;

/** Pause the active spinner (for interactive prompts) */
export function pauseSpinner(): void {
  if (activeSpinner) {
    activeSpinner.stop();
  }
}

/** Resume the active spinner after a prompt */
export function resumeSpinner(): void {
  if (activeSpinner) {
    activeSpinner.start();
  }
}

export interface ProgressTracker {
  /** Update the current step (shown as spinner text) */
  step: (message: string) => void;
  /** Mark the tracker as complete with final message */
  done: (message: string) => void;
  /** Mark the tracker as failed with error message */
  fail: (message: string) => void;
  /** Wrap an async operation to auto-fail on error */
  wrap: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * Creates a progress tracker for a multi-step operation.
 * Shows a single spinner that updates in place.
 *
 * @param title - The initial title for the spinner
 * @returns A ProgressTracker instance
 *
 * @example
 * const progress = createProgress('creating project');
 * progress.step('downloading template');
 * progress.step('installing dependencies');
 * progress.done('project created');
 */
export function createProgress(title: string, silent = false): ProgressTracker {
  const completedSteps: string[] = [];

  const spinner = ora({
    text: title,
    isSilent: silent,
  });

  activeSpinner = spinner;
  spinner.start();

  // Helper to log (respects silent mode)
  const log = (msg: string) => {
    if (!silent) console.info(msg);
  };

  return {
    step: (message: string) => {
      // Complete previous step with green check if there was one
      if (completedSteps.length > 0) {
        spinner.stop();
        log(`${pc.green('✓')} ${completedSteps[completedSteps.length - 1]}`);
      }
      completedSteps.push(message);
      spinner.text = message;
      spinner.start();
    },

    done: (message: string) => {
      // Complete the last step with green check
      if (completedSteps.length > 0) {
        spinner.stop();
        log(`${pc.green('✓')} ${completedSteps[completedSteps.length - 1]}`);
      } else {
        spinner.stop();
      }
      activeSpinner = null;
      if (message) {
        log('');
        log(`${pc.green('✓')} ${message}`);
      }
    },

    fail: (message: string) => {
      spinner.stop();
      activeSpinner = null;
      log(`${pc.red('✗')} ${pc.red(message)}`);
    },

    wrap: async <T>(fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Stop spinner and show tree-style breakdown on failure
        spinner.stop();
        activeSpinner = null;
        log(pc.cyan(`\n${title}`));
        for (const step of completedSteps) {
          log(pc.gray(`  ├─ ${step}`));
        }
        log(pc.red(`  └─ ✗ ${errorMessage}`));
        throw error;
      }
    },
  };
}
