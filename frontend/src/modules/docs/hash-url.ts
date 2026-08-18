export function getHashUrl(id: string) {
  if (typeof window === 'undefined') {
    return `#${id}`;
  }

  return `${window.location.origin}${window.location.pathname}${window.location.search}#${id}`;
}
