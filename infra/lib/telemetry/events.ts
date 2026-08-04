import type { AttrValue } from './otlp';

/** Attribute names a template string interpolates, extracted at compile time. */
export type Placeholders<T extends string> = T extends `${string}{${infer P}}${infer Rest}`
  ? P | Placeholders<Rest>
  : never;

/** A cataloged event: stable machine name + human message template. */
export interface EventDef<T extends string = string> {
  name: string;
  template: T;
}

/**
 * Catalog entry: the template's `{placeholders}` become REQUIRED attributes at
 * every emit site (see `Telemetry.event`); a renamed attribute fails the
 * typecheck at the template, never rendering a literal `{gen_id}`.
 */
export function defineEvent<const T extends string>(name: string, template: T): EventDef<T> {
  return { name, template };
}

/** Interpolate a template from attributes. A missing attribute stays visibly `{name}`. */
export function renderEvent(def: EventDef, attrs: Record<string, AttrValue>): string {
  return def.template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (whole, key: string) =>
    key in attrs ? String(attrs[key]) : whole,
  );
}
