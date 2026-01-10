export const getMethodColor = (method: string) => {
  switch (method.toLowerCase()) {
    case 'get':
      return 'text-blue-600 dark:text-blue-400';
    case 'post':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'put':
      return 'text-orange-600 dark:text-orange-300';
    case 'delete':
      return 'text-red-600 dark:text-red-400';
    case 'patch':
      return 'text-purple-600 dark:text-purple-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
};
