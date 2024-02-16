// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export function randomElement(array: Array<any>) {
  return array[Math.floor(Math.random() * array.length)];
}

export * from './cssVar';
export * from './getConnectionText';
export * from './getRenderContainer';
export * from './isCustomNodeSelected';
export * from './isTextSelected';
