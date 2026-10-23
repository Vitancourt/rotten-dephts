import { defineConfig } from 'vite';

// A relative base keeps asset links working wherever the site is hosted: GitHub Pages serves it under
// /<repo-name>/, and the repo name can change, so nothing here hard-codes it.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
}));
