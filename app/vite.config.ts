import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// relative base so the build works under a GitHub Pages sub-path and on Netlify
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
