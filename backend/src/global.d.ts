// Shim for BodyInit (DOM/Fetch API type) used by SDK-generated client code.
// The backend tsconfig excludes lib "DOM", but SDK sources are resolved
// transitively through test imports — this avoids TS2304 errors.
declare global {
  // biome-ignore lint/suspicious/noExplicitAny: minimal shim for DOM type not available in backend lib
  type BodyInit = any;
}

export {};
