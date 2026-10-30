/** Status badge colors by status class, one step stronger while its accordion row is hovered. */
export const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) {
    return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/50 group-hover/accordion-header:text-emerald-800 group-hover/accordion-header:bg-emerald-100 dark:group-hover/accordion-header:text-emerald-200 dark:group-hover/accordion-header:bg-emerald-900/60';
  }
  if (status >= 300 && status < 400) {
    return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/50 group-hover/accordion-header:text-blue-800 group-hover/accordion-header:bg-blue-100 dark:group-hover/accordion-header:text-blue-200 dark:group-hover/accordion-header:bg-blue-900/60';
  }
  if (status >= 400 && status < 500) {
    return 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/50 group-hover/accordion-header:text-orange-800 group-hover/accordion-header:bg-orange-100 dark:group-hover/accordion-header:text-orange-200 dark:group-hover/accordion-header:bg-orange-900/60';
  }
  if (status >= 500) {
    return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50 group-hover/accordion-header:text-red-800 group-hover/accordion-header:bg-red-100 dark:group-hover/accordion-header:text-red-200 dark:group-hover/accordion-header:bg-red-900/60';
  }
  return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-950/50 group-hover/accordion-header:text-gray-800 group-hover/accordion-header:bg-gray-100 dark:group-hover/accordion-header:text-gray-200 dark:group-hover/accordion-header:bg-gray-900/60';
};
