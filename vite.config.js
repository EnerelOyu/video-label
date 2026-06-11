import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/video-label/' : '/',
  build: { outDir: 'docs' },
  server: { host: true, port: 5173 },
}))
