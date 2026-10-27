export const mockMany = <T>(generator: () => T, count = 10): T[] => Array.from({ length: count }, generator);
