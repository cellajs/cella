const redacted = '[REDACTED]';

/** Values shorter than this are never redacted: they would match ordinary words, and no key or password is that short. */
const minSecretLength = 8;

/** The userinfo of a URL authority (`scheme://user:password@`): redacted whether or not boot knows the value. */
const userinfoPattern = /(:\/\/)[^/?#@\s]+@/g;

export interface SecretRedactor {
  /** Remember secret values; every later `redact` call replaces them. Empty and short values are ignored. */
  add(...values: ReadonlyArray<string | undefined>): void;
  /** `text` with every known value (raw, URL-encoded or JSON-escaped) and any URL userinfo replaced by `[REDACTED]`. */
  redact(text: string): string;
}

/** The password of a URL-shaped value (a DSN), in its encoded and decoded form. */
function urlPasswords(value: string): string[] {
  if (!value.includes('://')) return [];
  try {
    const { password } = new URL(value);
    return password ? [password, decodeURIComponent(password)] : [];
  } catch {
    return [];
  }
}

/** The forms a value takes in a log: raw, inside a URL, inside a JSON string; a DSN's password also counts alone. */
function variantsOf(value: string): string[] {
  return [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1), ...urlPasswords(value)];
}

/**
 * Redaction by value for the boot runner: it learns each secret as boot handles it (the baked boot key, the service
 * key, every hydrated runtime secret) and replaces that exact value in any text, whatever variable name printed it.
 * Name-based line scrubbing misses a secret printed without its name, such as a DSN in a driver error.
 */
export function createSecretRedactor(): SecretRedactor {
  const needles = new Set<string>();
  // Longest first, so a value that contains another (a DSN and its password) is replaced whole.
  let ordered: string[] = [];

  return {
    add: (...values) => {
      for (const value of values) {
        if (!value) continue;
        for (const variant of variantsOf(value)) if (variant.length >= minSecretLength) needles.add(variant);
      }
      ordered = [...needles].sort((a, b) => b.length - a.length);
    },
    redact: (text) => {
      let result = text;
      for (const needle of ordered) result = result.split(needle).join(redacted);
      return result.replace(userinfoPattern, `$1${redacted}@`);
    },
  };
}
