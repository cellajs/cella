/**
 * Returns a Tailwind color class based on HTTP status code ranges
 */
export const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) {
    return 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/50';
  }
  if (status >= 300 && status < 400) {
    return 'text-blue-700 bg-blue-50 dark:text-blue-300 dark:bg-blue-950/50';
  }
  if (status >= 400 && status < 500) {
    return 'text-orange-700 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/50';
  }
  if (status >= 500) {
    return 'text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50';
  }
  return 'text-gray-700 bg-gray-50 dark:text-gray-300 dark:bg-gray-950/50';
};
