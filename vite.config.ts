import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const rawBase = process.env.BASE_PATH;
const base = rawBase ? `${rawBase.replace(/\/$/, '')}/` : '/';

export default defineConfig({
  plugins: [tailwindcss()],
  base,
});
