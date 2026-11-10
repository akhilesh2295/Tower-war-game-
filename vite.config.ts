/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// `base: './'` keeps asset URLs relative so the build works from any
// sub-path (GitHub Pages, itch.io, a plain static host, ...).
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
  test: {
    // `npm run balance` sets BALANCE=1 to run the (slow) balance report instead.
    include: process.env.BALANCE ? ['scripts/**/*.test.ts'] : ['tests/**/*.test.ts'],
  },
});
