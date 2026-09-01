import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5230, strictPort: true },
})
