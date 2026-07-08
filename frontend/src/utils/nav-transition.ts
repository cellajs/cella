let skipPageEnter = false;

/** Set whether the page-enter mask should be skipped for the current navigation. */
export const setSkipPageEnter = (value: boolean) => {
  skipPageEnter = value;
};

/** Read whether the page-enter mask should be skipped for the current navigation. */
export const getSkipPageEnter = () => skipPageEnter;
