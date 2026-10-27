/** `snake_case` to `camelCase`: an underscore before a lowercase letter goes, and the letter is capitalized. */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
