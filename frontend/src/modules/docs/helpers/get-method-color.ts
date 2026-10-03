export const getMethodColor = (method: string) => {
  switch (method.toLowerCase()) {
    case 'get':
      return 'text-blue-700 dark:text-blue-400';
    case 'post':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'put':
      return 'text-orange-700 dark:text-orange-300';
    case 'delete':
      return 'text-red-700 dark:text-red-400';
    case 'patch':
      return 'text-purple-700 dark:text-purple-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};
