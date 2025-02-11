/**
 * Returns the keys of an object as an array of its keys' types.
 *
 * @param obj - The object whose keys are to be returned.
 * @returns An array of the object's keys.
 */
export const objectKeys = <T extends object>(obj: T) => {
  return Object.keys(obj) as Array<keyof T>;
};

/**
 * Returns the entries of an object as an array of key-value pairs with their respective types.
 *
 * @param obj - The object whose entries are to be returned.
 * @returns An array of the object's key-value pairs.
 */
export const objectEntries = <T extends object>(obj: T) => {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
};
