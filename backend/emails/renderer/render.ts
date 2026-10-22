import { jsxToString } from './jsx-to-string.js';

const docType = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/** Renders an email element to the HTML that is sent: the renderer writes the final markup, nothing re-parses it. */
export const render = async (component: React.ReactElement) => docType + (await jsxToString(component));
