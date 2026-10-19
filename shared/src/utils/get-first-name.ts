/** The first word of a display name, or null for a blank one. */
export const getFirstName = (name?: string | null) => name?.trim().split(/\s+/)[0] || null;
