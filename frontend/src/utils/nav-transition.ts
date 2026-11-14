let skipPageEnter = false;
let hasNavigated = false;

export const setSkipPageEnter = (value: boolean) => {
  skipPageEnter = value;
};

export const getSkipPageEnter = () => skipPageEnter;

export const setHasNavigated = () => {
  hasNavigated = true;
};

/** False until a navigation in this document: a page load leaves focus at the start, where Tab reaches the skip link or the navigation first. */
export const getHasNavigated = () => hasNavigated;
