/**
 * Returns a Tailwind color class based on HTTP status code ranges
 */
export const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) {
    return 'text-green-600 bg-green-50';
  }
  if (status >= 300 && status < 400) {
    return 'text-blue-600 bg-blue-50';
  }
  if (status >= 400 && status < 500) {
    return 'text-orange-600 bg-orange-50';
  }
  if (status >= 500) {
    return 'text-red-600 bg-red-50';
  }
  return 'text-gray-600 bg-gray-50';
};
