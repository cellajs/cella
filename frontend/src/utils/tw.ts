/**
 * Returns its class string unchanged, as a tagged template or a call. It exists for class sorting only: Biome's
 * useSortedClasses lists `tw` in biome.jsonc, so class-string constants outside `className` and `cn` get sorted too.
 * It merges nothing; `cn` resolves conflicts.
 * @example const ring = tw`ring-2 ring-ring ring-offset-2`;
 */
export function tw(strings: TemplateStringsArray, ...values: (string | number)[]): string;
export function tw(classes: string): string;
export function tw(classes: TemplateStringsArray | string, ...values: (string | number)[]): string {
  return typeof classes === 'string' ? classes : String.raw({ raw: classes }, ...values);
}
