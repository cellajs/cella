/**
 * Retrieves a deeply nested value from an object or array based on a string or array path.
 *
 * @param obj - Object to query.
 * @param path - Pth to the desired value, either as a dot/bracket notation string or an array of keys.
 * @returns Value at specified path or undefined if it does not exist.
 */
export const getNestedValue = <TObject extends object, TPath extends Array<string | number>>(
  obj: TObject,
  path: string | TPath,
): DeepValue<TObject, TPath> | undefined => {
  // Exit early if the input is not a valid object
  if (obj == null || typeof obj !== 'object') return undefined;

  // Convert string path to array format, e.g. "a.b[0].c" -> ['a', 'b', 0, 'c']
  const pathArray = Array.isArray(path)
    ? path
    : (path
        .replace(/\[(\w+)\]/g, '.$1')
        .replace(/^\./, '')
        .split('.')
        .map((key) => (/^\d+$/.test(key) ? Number(key) : key)) as TPath); // Convert numeric strings to numbers

  // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
  let result: any = obj;

  for (const key of pathArray) {
    if (result == null) return undefined;

    // Either index into an array or property lookup on object
    if ((typeof key === 'number' && Array.isArray(result) && key in result) || (typeof key === 'string' && Object.hasOwn(result, key))) {
      result = result[key];
    } else return undefined; // Invalid path
  }

  return result;
};

type DeepValue<T, P extends Array<string | number>> = P extends [infer Head, ...infer Rest]
  ? Head extends keyof T
    ? Rest extends Array<string | number>
      ? DeepValue<T[Head], Rest>
      : T[Head]
    : Head extends `${number}`
      ? T extends Array<infer U>
        ? Rest extends Array<string | number>
          ? DeepValue<U, Rest>
          : U
        : undefined
      : undefined
  : T;
