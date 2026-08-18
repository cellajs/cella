// Shim for BodyInit: the backend tsconfig excludes lib "DOM", but test imports resolve SDK sources that need it.
declare global {
  // biome-ignore lint/suspicious/noExplicitAny: minimal shim for DOM type not available in backend lib
  type BodyInit = any;
}

export {};
