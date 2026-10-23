import { defineConfig } from 'vite';

// Served from https://<user>.github.io/rpg-dungeons/ on GitHub Pages.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rpg-dungeons/' : '/',
}));
