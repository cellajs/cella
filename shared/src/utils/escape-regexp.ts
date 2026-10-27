/** A literal string as a RegExp source: every pattern character escaped, so the expression matches the text itself. */
export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
