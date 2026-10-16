/* Builds the interface (src/, React + TypeScript) into one classic script, js/app/univicoustic-ui.js, that index.html
   loads after the measurement, calculation and report modules in js/. A classic script (IIFE), not a module, so the
   app keeps working when its files are opened from the Python server, Vercel, or the test pages, which load exactly
   the scripts index.html lists. React is bundled in; nothing is fetched at run time. */
import { defineConfig } from 'vite';

export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'js/app',
    emptyOutDir: true,
    target: 'es2019',
    sourcemap: false, // the built script is kept in the repository; `npm run watch` rebuilds it while working on src/
    minify: true,
    lib: {
      entry: 'src/main.tsx',
      name: 'UnivicousticUI',
      formats: ['iife'],
      fileName: () => 'univicoustic-ui.js',
    },
  },
});
