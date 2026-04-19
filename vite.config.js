import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // BELANGRIJK voor GitHub Pages project site:
  // De app wordt geserveerd op /zonnedak-analyser/ i.p.v. root.
  // Zonder deze regel laden JS/CSS assets niet (404).
  base: '/zonnedak-analyser/',
  build: {
    outDir: 'dist',
  },
});
