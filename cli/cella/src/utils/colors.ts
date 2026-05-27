import process from 'node:process';
import { styleText } from 'node:util';

type ColorStyle = 'blue' | 'bold' | 'cyan' | 'dim' | 'gray' | 'green' | 'magenta' | 'red' | 'white' | 'yellow';

function colorsEnabled(): boolean {
  if ('NO_COLOR' in process.env) return false;
  if ('FORCE_COLOR' in process.env) return true;
  return !!process.stdout.isTTY;
}

function applyStyle(style: ColorStyle, text: string): string {
  if (!colorsEnabled()) return text;
  return styleText(style, text, { validateStream: false });
}

const pc = {
  blue: (text: string) => applyStyle('blue', text),
  bold: (text: string) => applyStyle('bold', text),
  cyan: (text: string) => applyStyle('cyan', text),
  dim: (text: string) => applyStyle('dim', text),
  gray: (text: string) => applyStyle('gray', text),
  green: (text: string) => applyStyle('green', text),
  magenta: (text: string) => applyStyle('magenta', text),
  red: (text: string) => applyStyle('red', text),
  white: (text: string) => applyStyle('white', text),
  yellow: (text: string) => applyStyle('yellow', text),
};

export default pc;
