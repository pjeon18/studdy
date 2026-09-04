import { defineConfig } from 'vite'

// One id per build: baked into the bundle AND emitted as version.json, so a
// long-running client (an installed PWA that never reloads) can notice a
// newer deployment and refresh itself.
const BUILD_ID = String(Date.now())

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  server: { port: 5230, strictPort: true },
  define: { __STUDDY_BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [
    {
      name: 'emit-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: BUILD_ID }) })
      },
    },
  ],
})
