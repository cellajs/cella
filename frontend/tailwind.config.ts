import typographyPlugin from '@tailwindcss/typography';
import { config } from 'config';
import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';
/** @type {Config} */

export default {
  darkMode: 'class',
  variants: {
    extend: {
      display: ['empty'],
    },
  },
  content: ['./src/**/*.{ts,tsx}', '../config/**/*.{ts,tsx}'],
  theme: {
    screens: config.theme.screenSizes,
    container: {
      center: true,
      padding: '.75rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        roboto: ['Open Sans', 'ui-sans-serif', 'sans-serif'],
      },
      translate: {
        active: 'translate(0, 0)',
      },
      transitionProperty: {
        spacing: 'margin, padding',
        size: 'width, height',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        success: 'hsl(var(--success))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
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
