/**
 * Stands in for `canvg` and `html2canvas`, the optional packages jspdf loads only for `.html()` and SVG images.
 * The table export draws text and tables, so the packages are not installed and this is what those paths reach.
 */
export default function jspdfOptionalStub(): never {
  throw new Error('jspdf .html() and SVG rendering are not available in this build');
}
