export const getMethodColor = (method: string) => {
  switch (method.toLowerCase()) {
    case 'get':
      return 'text-blue-600';
    case 'post':
      return 'text-green-600';
    case 'put':
      return 'text-orange-600';
    case 'delete':
      return 'text-red-600';
    case 'patch':
      return 'text-purple-600';
    default:
      return 'text-gray-600';
  }
};
