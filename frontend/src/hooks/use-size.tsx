import * as React from 'react';

function measure() {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

export function useSize() {
  const [size, setSize] = React.useState(measure());

  React.useLayoutEffect(() => {
    function onResize() {
      setSize(measure());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return size;
}
