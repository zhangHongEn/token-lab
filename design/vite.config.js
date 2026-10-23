import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: {
    outDir: 'output/design-preview',
    rollupOptions: { input: fileURLToPath(new URL('../design.html', import.meta.url)) },
  },
});
