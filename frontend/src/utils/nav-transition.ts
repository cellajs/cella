let skipPageEnter = false;
let hasNavigated = false;

export const setSkipPageEnter = (value: boolean) => {
  skipPageEnter = value;
};

export const getSkipPageEnter = () => skipPageEnter;

export const setHasNavigated = () => {
  hasNavigated = true;
};

/** False until a navigation in this document: a page load leaves focus at the start, with the skip link as the first Tab stop. */
export const getHasNavigated = () => hasNavigated;
