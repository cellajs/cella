export const objectKeys = <T extends object>(obj: T) => {
  return Object.keys(obj) as Array<keyof T>;
};

export const objectEntries = <T extends object>(obj: T) => {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
};
