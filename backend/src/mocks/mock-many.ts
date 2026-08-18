export const mockMany = <T>(generator: () => T, count = 10): T[] => {
  return Array.from({ length: count }, generator);
};
