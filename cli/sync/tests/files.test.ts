import { describe, it, expect } from 'vitest';
import { isBinaryFile } from '../src/utils/files';

describe('isBinaryFile', () => {
  it('should detect image files as binary', () => {
    expect(isBinaryFile('image.png')).toBe(true);
    expect(isBinaryFile('photo.jpg')).toBe(true);
    expect(isBinaryFile('icon.ico')).toBe(true);
    expect(isBinaryFile('logo.webp')).toBe(true);
  });

  it('should detect font files as binary', () => {
    expect(isBinaryFile('font.ttf')).toBe(true);
    expect(isBinaryFile('font.woff')).toBe(true);
    expect(isBinaryFile('font.woff2')).toBe(true);
  });

  it('should detect archive files as binary', () => {
    expect(isBinaryFile('archive.zip')).toBe(true);
    expect(isBinaryFile('backup.tar.gz')).toBe(true);
  });

  it('should detect text/code files as non-binary', () => {
    expect(isBinaryFile('index.ts')).toBe(false);
    expect(isBinaryFile('styles.css')).toBe(false);
    expect(isBinaryFile('README.md')).toBe(false);
    expect(isBinaryFile('package.json')).toBe(false);
    expect(isBinaryFile('config.yaml')).toBe(false);
  });

  it('should handle paths with directories', () => {
    expect(isBinaryFile('src/assets/logo.png')).toBe(true);
    expect(isBinaryFile('frontend/src/index.tsx')).toBe(false);
  });

  it('should handle files without extensions', () => {
    expect(isBinaryFile('Makefile')).toBe(false);
    expect(isBinaryFile('LICENSE')).toBe(false);
  });
});
