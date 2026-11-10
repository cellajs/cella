/** The layout standing around a failed route or a notice: root (none), public, auth or app. A layout route declares its own in `staticData.boundary`. */
export type BoundaryType = 'root' | 'app' | 'public' | 'auth';

/** The boundary of the nearest layout, from `staticData` entries ordered root first. */
export const boundaryOf = (staticData: readonly ({ boundary?: BoundaryType } | undefined)[]) =>
  staticData.findLast((data) => data?.boundary)?.boundary;
