/** The app's own BlockNote blocks, added to the template's schema; their configs are `appBlockConfigs` in `shared/app/blocknote`. */
export const appBlockSpecs = {};

/** The slash menu keys of the app's blocks. */
export const appTypeToKeys = {} satisfies Record<keyof typeof appBlockSpecs, never[]>;
