import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// relative base so the build works under a GitHub Pages sub-path and on Netlify
export default defineConfig({
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  plugins: [react(), tailwindcss()],
})
