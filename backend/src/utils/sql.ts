export const prepareStringForILikeFilter = (value: string) => {
  return `%${value.trim()}%`;
};
