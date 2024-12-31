export const searchKeys = {
  all: ['search'] as const,
  byValue: (value: string) => [...searchKeys.all, value] as const,
};
