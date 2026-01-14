import typographyPlugin from '@tailwindcss/typography';
import { appConfig } from 'config';
import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';
/** @type {Config} */

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}', '../config/**/*.{ts,tsx}'],
  theme: {
    screens: appConfig.theme.screenSizes,
    container: {
      center: true,
      padding: {
        DEFAULT: '1rem',
      },
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontSize: {
        md: '0.888rem',
      },
      fontFamily: {
        sans: ['Open Sans', 'ui-sans-serif', 'sans-serif'],
      },
      translate: {
        active: 'translate(0, 0)',
      },
      transitionProperty: {
        spacing: 'margin, padding',
        size: 'width, height',
      },
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        success: 'var(--success)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'collapsible-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-collapsible-content-height)' },
        },
        'collapsible-up': {
          from: { height: 'var(--radix-collapsible-content-height)' },
          to: { height: '0' },
        },
        wave: {
          '0%': { transform: 'rotate(0.0deg)' },
          '10%': { transform: 'rotate(14deg)' },
          '20%': { transform: 'rotate(-8deg)' },
          '30%': { transform: 'rotate(14deg)' },
          '40%': { transform: 'rotate(-4deg)' },
          '50%': { transform: 'rotate(10.0deg)' },
          '60%': { transform: 'rotate(0.0deg)' },
          '100%': { transform: 'rotate(0.0deg)' },
        },
        heartbeat: {
          '0%': { transform: 'scale(1);' },
          '14%': { transform: 'scale(1.3);' },
          '28%': { transform: 'scale(1);' },
          '42%': { transform: 'scale(1.3);' },
          '70%': { transform: 'scale(1);' },
        },
        'flip-horizontal': {
          '50%': { transform: 'rotateY(180deg)' },
        },
        'flip-vertical': {
          '50%': { transform: 'rotateX(180deg)' },
        },
      },
      animation: {
        'waving-hand': 'wave 2s linear infinite',
        'spin-slow': 'spin 2s linear infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
        heartbeat: 'heartbeat 1s infinite',
        hflip: 'flip-horizontal 2s infinite',
        vflip: 'flip-certical 2s infinite',
      },
    },
  },
  plugins: [animatePlugin, typographyPlugin],
} satisfies Config;
