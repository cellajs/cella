// Keys for general queries
export const generalKeys = {
  check: ['check'] as const,
  search: (value: string) => ['search', value] as const,
  checkToken: () => [...generalKeys.check, 'token'] as const,
  checkSlug: () => [...generalKeys.check, 'slug'] as const,
  acceptInvite: ['invite', 'accept'] as const,
};
