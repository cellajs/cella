import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind CSS classes, combining them and resolving conflicts.
 *
 * @param inputs - A list of classes to be merged.
 * @returns A string with the merged Tailwind classes.
 */
export const cn = (...inputs: ClassValue[]) => {
  return twMerge(clsx(inputs));
};
